import test from 'tape';
import {
  buildPurchaseAnnex,
  buildSaleAnnex,
  InfInvoiceInput,
  INF_THRESHOLD,
} from '../infAggregator';

function saleInv(overrides: Partial<InfInvoiceInput> = {}): InfInvoiceInput {
  return {
    invoiceNumber: 'INV-001',
    invoiceDate: '2026-05-15',
    partyName: 'Test OÜ',
    registryCode: '10000001',
    isCreditNote: false,
    netTotal: 1500,
    grandTotal: 1860,
    ratePortions: [{ rate: 24, net: 1500 }],
    hasZeroRated: false,
    vatTotal: 0,
    ...overrides,
  };
}

function purchaseInv(
  overrides: Partial<InfInvoiceInput> = {}
): InfInvoiceInput {
  return {
    invoiceNumber: 'BILL-001',
    invoiceDate: '2026-05-10',
    partyName: 'Supplier OÜ',
    registryCode: '20000002',
    isCreditNote: false,
    netTotal: 1000,
    grandTotal: 1240,
    ratePortions: [],
    hasZeroRated: false,
    vatTotal: 240,
    ...overrides,
  };
}

test('inf: threshold is €1000 ex VAT per partner', (t) => {
  t.equal(INF_THRESHOLD, 1000);
  t.deepEqual(
    buildSaleAnnex([saleInv({ netTotal: 999.99 })]),
    [],
    'below threshold skipped'
  );
  t.equal(
    buildSaleAnnex([saleInv({ netTotal: 1000 })]).length,
    1,
    'exactly at threshold included'
  );
  t.end();
});

test('inf: threshold sums across a partner and includes all their invoices', (t) => {
  const lines = buildSaleAnnex([
    saleInv({
      invoiceNumber: 'INV-001',
      netTotal: 600,
      ratePortions: [{ rate: 24, net: 600 }],
    }),
    saleInv({
      invoiceNumber: 'INV-002',
      netTotal: 500,
      ratePortions: [{ rate: 24, net: 500 }],
    }),
    saleInv({
      invoiceNumber: 'INV-003',
      registryCode: '99999999',
      partyName: 'Small OÜ',
      netTotal: 300,
      ratePortions: [{ rate: 24, net: 300 }],
    }),
  ]);
  t.deepEqual(
    lines.map((l) => l.invoiceNumber),
    ['INV-001', 'INV-002'],
    'both invoices of over-threshold partner, other partner skipped'
  );
  t.end();
});

test('inf: credit notes ride along once regular invoices reach €1000', (t) => {
  const lines = buildSaleAnnex([
    saleInv({ invoiceNumber: 'INV-001', netTotal: 1000 }),
    saleInv({
      invoiceNumber: 'RINV-001',
      isCreditNote: true,
      netTotal: -300,
      ratePortions: [{ rate: 24, net: -300 }],
    }),
  ]);
  t.equal(lines.length, 2);
  const credit = lines.find((l) => l.invoiceNumber === 'RINV-001')!;
  t.equal(credit.invoiceSum, -300, 'credit note declared negative');
  t.equal(credit.sumForRateInPeriod, -300);
  t.end();
});

test('inf: credit notes are tallied separately from regular invoices', (t) => {
  t.deepEqual(
    buildSaleAnnex([
      saleInv({ invoiceNumber: 'INV-001', netTotal: 900 }),
      saleInv({
        invoiceNumber: 'RINV-001',
        isCreditNote: true,
        netTotal: -900,
        ratePortions: [{ rate: 24, net: -900 }],
      }),
    ]),
    [],
    'neither tally reaches €1000'
  );
  t.equal(
    buildSaleAnnex([
      saleInv({
        invoiceNumber: 'RINV-002',
        isCreditNote: true,
        netTotal: -1200,
        ratePortions: [{ rate: 24, net: -1200 }],
      }),
    ]).length,
    1,
    'credit notes alone can reach the threshold'
  );
  t.end();
});

test('inf: erisus 03 set only when invoice carries a 0%-rate line', (t) => {
  const [plain] = buildSaleAnnex([saleInv()]);
  t.equal(plain.comments, undefined);

  const [mixed] = buildSaleAnnex([
    saleInv({
      netTotal: 2000,
      ratePortions: [{ rate: 24, net: 1500 }],
      hasZeroRated: true,
    }),
  ]);
  t.equal(mixed.comments, '03');
  t.equal(mixed.invoiceSum, 2000, 'cell 6 keeps full ex-VAT total');
  t.equal(mixed.sumForRateInPeriod, 1500, 'cell 9 keeps only the taxed part');
  t.end();
});

test('inf: zero-rate-only invoices are not declared and not counted', (t) => {
  t.deepEqual(
    buildSaleAnnex([
      saleInv({
        invoiceNumber: 'INV-001',
        netTotal: 5000,
        ratePortions: [],
        hasZeroRated: true,
      }),
      saleInv({
        invoiceNumber: 'INV-002',
        netTotal: 500,
        ratePortions: [{ rate: 24, net: 500 }],
      }),
    ]),
    [],
    'zero-only invoice neither declared nor pushing partner over threshold'
  );
  t.end();
});

test('inf: parties without registry code are excluded', (t) => {
  t.deepEqual(
    buildSaleAnnex([saleInv({ registryCode: undefined, netTotal: 5000 })]),
    []
  );
  t.deepEqual(
    buildPurchaseAnnex([
      purchaseInv({ registryCode: undefined, netTotal: 5000, vatTotal: 1200 }),
    ]),
    []
  );
  t.end();
});

test('inf: multi-rate invoice gets one line per rate, cell 6 repeated', (t) => {
  const lines = buildSaleAnnex([
    saleInv({
      netTotal: 1500,
      ratePortions: [
        { rate: 24, net: 1000 },
        { rate: 9, net: 500 },
      ],
    }),
  ]);
  t.equal(lines.length, 2);
  t.deepEqual(
    lines.map((l) => l.taxRate),
    ['24', '9']
  );
  t.deepEqual(
    lines.map((l) => l.invoiceSum),
    [1500, 1500]
  );
  t.deepEqual(
    lines.map((l) => l.sumForRateInPeriod),
    [1000, 500]
  );
  t.end();
});

test('inf B: line carries sum incl VAT and input VAT of the period', (t) => {
  const [line] = buildPurchaseAnnex([purchaseInv()]);
  t.equal(line.sellerRegCode, '20000002');
  t.equal(line.sellerName, 'Supplier OÜ');
  t.equal(line.invoiceNumber, 'BILL-001');
  t.equal(line.invoiceDate, '2026-05-10');
  t.equal(line.invoiceSumVat, 1240, 'cell 6 includes VAT');
  t.equal(line.vatInPeriod, 240, 'cell 8 = input VAT on KMD line 5');
  t.end();
});

test('inf B: threshold uses ex-VAT total; invoices without VAT skipped', (t) => {
  t.deepEqual(
    buildPurchaseAnnex([
      purchaseInv({ netTotal: 999, grandTotal: 1238.76, vatTotal: 239.76 }),
    ]),
    [],
    'ex-VAT total below €1000 despite grand total above'
  );
  t.deepEqual(
    buildPurchaseAnnex([
      purchaseInv({ netTotal: 5000, grandTotal: 5000, vatTotal: 0 }),
    ]),
    [],
    'no deductible VAT — nothing to declare'
  );
  t.end();
});

test('inf B: purchase credit note declared negative once partner qualifies', (t) => {
  const lines = buildPurchaseAnnex([
    purchaseInv(),
    purchaseInv({
      invoiceNumber: 'RBILL-001',
      isCreditNote: true,
      netTotal: -200,
      grandTotal: -248,
      vatTotal: -48,
    }),
  ]);
  t.equal(lines.length, 2);
  const credit = lines.find((l) => l.invoiceNumber === 'RBILL-001')!;
  t.equal(credit.invoiceSumVat, -248);
  t.equal(credit.vatInPeriod, -48);
  t.end();
});
