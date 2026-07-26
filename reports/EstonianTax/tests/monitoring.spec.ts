import test from 'tape';
import { VatCodeName, VAT_CODES } from '../../../regional/ee';
import { emptyKmdBody, VAT_CODE_TO_BUCKET } from '../lineMap';
import {
  buildMonitoringRows,
  computeVat,
  groupByKmdLine,
  kmdLineFor,
  kmdLineOptions,
  KMD_LINE_LABELS,
  MonitoringEntry,
  OFF_KMD_LINE,
  round2,
  VD_ONLY_LINE,
} from '../MonitoringReport';

const FIXTURE: MonitoringEntry[] = [
  {
    date: '2026-05-03',
    docType: 'Sales Invoice',
    docName: 'SINV-1001',
    party: 'Acme OÜ',
    vatCode: 'EE24',
    net: 1000,
  },
  {
    date: '2026-05-07',
    docType: 'Journal Entry',
    docName: 'JV-77',
    party: 'Beta AS',
    vatCode: 'EE24',
    net: 250.55,
  },
  {
    date: '2026-05-10',
    docType: 'Sales Invoice',
    docName: 'SINV-1002',
    party: 'Gamma OÜ',
    vatCode: 'MARGIN_24',
    net: 300,
  },
  {
    date: '2026-05-12',
    docType: 'Sales Invoice',
    docName: 'SINV-1003',
    party: 'Delta GmbH',
    vatCode: 'ZERO_EU_GOODS',
    net: 500,
  },
  {
    date: '2026-05-15',
    docType: 'Purchase Invoice',
    docName: 'PINV-55',
    party: 'Lieferant GmbH',
    vatCode: 'EU_RC_GOODS',
    net: 400,
  },
  {
    date: '2026-05-20',
    docType: 'Journal Entry',
    docName: 'JV-80',
    party: '',
    vatCode: 'EXEMPT',
    net: 120,
  },
  {
    date: '2026-05-21',
    docType: 'Sales Invoice',
    docName: 'SINV-1004',
    party: 'OSS Client',
    vatCode: 'OSS_SALES',
    net: 90,
  },
  {
    date: '2026-05-22',
    docType: 'Sales Invoice',
    docName: 'SINV-1005',
    party: 'FR Client',
    vatCode: 'ZERO_EU_TRIANGLE',
    net: 60,
  },
];

test('kmdLineFor: maps codes to KMD lines via bucket primary', (t) => {
  t.equal(kmdLineFor('EE24'), '1');
  t.equal(kmdLineFor('MARGIN_24'), '1');
  t.equal(kmdLineFor('MARGIN_22'), '1²');
  t.equal(kmdLineFor('EE9'), '2');
  t.equal(kmdLineFor('MARGIN_5'), '2¹');
  t.equal(kmdLineFor('EE13'), '2²');
  t.equal(kmdLineFor('EE0'), '3');
  t.equal(kmdLineFor('ZERO_EU_GOODS'), '3');
  t.equal(kmdLineFor('ZERO_EXPORT'), '3');
  t.equal(kmdLineFor('EU_RC_GOODS'), '6');
  t.equal(kmdLineFor('EU_RC_SERVICES'), '6');
  t.equal(kmdLineFor('NON_EU_RC'), '7');
  t.equal(kmdLineFor('EXEMPT'), '8');
  t.equal(kmdLineFor('ZERO_EU_TRIANGLE'), VD_ONLY_LINE);
  t.equal(kmdLineFor('OSS_SALES'), OFF_KMD_LINE);
  t.equal(kmdLineFor('EU_FIXED_ESTAB'), OFF_KMD_LINE);
  t.equal(kmdLineFor('BOGUS'), null);
  t.end();
});

test('kmdLineFor: every VAT code resolves to a line label', (t) => {
  for (const code of Object.keys(VAT_CODES)) {
    const line = kmdLineFor(code);
    t.ok(line, `${code} → ${String(line)}`);
  }
  t.end();
});

test('computeVat: applies the VAT_CODES rate on net', (t) => {
  t.equal(computeVat('EE24', 1000), 240);
  t.equal(computeVat('EE9', 200), 18);
  t.equal(computeVat('EE13', 100), 13);
  t.equal(computeVat('EE0', 1000), 0);
  t.equal(computeVat('EXEMPT', 1000), 0);
  t.equal(computeVat('EU_RC_GOODS', 400), 96);
  t.equal(computeVat('EE24', 33.33), 8);
  t.equal(computeVat('BOGUS', 1000), 0);
  t.end();
});

test('buildMonitoringRows: attaches line + VAT, drops unknown codes', (t) => {
  const rows = buildMonitoringRows([
    ...FIXTURE,
    {
      date: '2026-05-25',
      docType: 'Journal Entry',
      docName: 'JV-99',
      party: '',
      vatCode: 'NOT_A_CODE',
      net: 10,
    },
  ]);

  t.equal(rows.length, FIXTURE.length, 'unknown code excluded');

  const sinv = rows.find((r) => r.docName === 'SINV-1001')!;
  t.equal(sinv.kmdLine, '1');
  t.equal(sinv.vat, 240);

  const rc = rows.find((r) => r.docName === 'PINV-55')!;
  t.equal(rc.kmdLine, '6');
  t.equal(rc.vat, 96);

  const triangle = rows.find((r) => r.docName === 'SINV-1005')!;
  t.equal(triangle.kmdLine, VD_ONLY_LINE);
  t.equal(triangle.vat, 0);
  t.end();
});

test('groupByKmdLine: groups, orders and subtotals per line', (t) => {
  const groups = groupByKmdLine(buildMonitoringRows(FIXTURE));

  t.deepEqual(
    groups.map((g) => g.kmdLine),
    ['1', '3', '6', '8', VD_ONLY_LINE, OFF_KMD_LINE],
    'line order'
  );

  const line1 = groups[0];
  t.equal(line1.rows.length, 3);
  t.deepEqual(
    line1.rows.map((r) => r.docName),
    ['SINV-1001', 'JV-77', 'SINV-1002'],
    'rows sorted by date'
  );
  t.equal(line1.netTotal, 1550.55);
  t.equal(line1.vatTotal, round2(240 + 60.13 + 72));

  const line6 = groups.find((g) => g.kmdLine === '6')!;
  t.equal(line6.netTotal, 400);
  t.equal(line6.vatTotal, 96);
  t.end();
});

test('groupByKmdLine: kmdLine filter narrows to one line', (t) => {
  const rows = buildMonitoringRows(FIXTURE);

  const all = groupByKmdLine(rows, 'All');
  t.equal(all.length, 6, "'All' keeps every group");

  const only1 = groupByKmdLine(rows, '1');
  t.equal(only1.length, 1);
  t.equal(only1[0].kmdLine, '1');
  t.equal(only1[0].rows.length, 3);

  t.deepEqual(groupByKmdLine(rows, '5'), [], 'no rows for unmatched line');
  t.end();
});

test('groupByKmdLine: subtotals reconcile with KmdReport bucketing', (t) => {
  const body = emptyKmdBody();
  for (const entry of FIXTURE) {
    const bucket = VAT_CODE_TO_BUCKET[entry.vatCode as VatCodeName];
    if (!bucket?.primary) {
      continue;
    }

    body[bucket.primary] = round2(body[bucket.primary] + entry.net);
  }

  const groups = groupByKmdLine(buildMonitoringRows(FIXTURE));
  const labelToField = new Map(
    Object.entries(KMD_LINE_LABELS).map(([field, label]) => [label, field])
  );

  for (const group of groups) {
    const field = labelToField.get(group.kmdLine);
    if (!field) {
      continue;
    }

    t.equal(
      group.netTotal,
      body[field as keyof typeof body],
      `line ${group.kmdLine} subtotal matches body.${field}`
    );
  }

  t.equal(body.transactions24, 1550.55, 'fixture covers merged-code line');
  t.end();
});

test('kmdLineOptions: distinct reachable lines in KMD order', (t) => {
  const options = kmdLineOptions();
  const values = options.map((o) => o.value);

  t.deepEqual(values, [
    '1',
    '1²',
    '2',
    '2¹',
    '2²',
    '3',
    '6',
    '7',
    '8',
    VD_ONLY_LINE,
    OFF_KMD_LINE,
  ]);
  t.equal(new Set(values).size, values.length, 'no duplicates');
  for (const option of options) {
    t.equal(option.label, option.value);
  }
  t.end();
});
