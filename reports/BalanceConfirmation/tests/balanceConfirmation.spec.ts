import test from 'tape';
import {
  BalanceAccountType,
  BalanceLetter,
  foldPartyBalances,
  getConfirmationDocumentHtml,
  getLetterHtml,
} from '../letterHtml';

const accountTypes: Record<string, BalanceAccountType> = {
  Debtors: 'Receivable',
  Creditors: 'Payable',
};

function getLetter(overrides: Partial<BalanceLetter> = {}): BalanceLetter {
  return {
    companyName: 'Näidis OÜ',
    companyRegistryCode: '12345678',
    companyVatNumber: 'EE123456789',
    partyName: 'Klient AS',
    partyRegistryCode: '87654321',
    asOfDate: 'Dec 31, 2026',
    balance: '1,200.00 EUR',
    weOwe: false,
    invoices: [
      {
        name: 'SINV-1001',
        date: 'Nov 12, 2026',
        grandTotal: '1,000.00',
        outstanding: '700.00',
      },
      {
        name: 'SINV-1002',
        date: 'Dec 2, 2026',
        grandTotal: '500.00',
        outstanding: '500.00',
      },
    ],
    ...overrides,
  };
}

test('foldPartyBalances: aggregates per party by account type', (t) => {
  const balances = foldPartyBalances(
    [
      { party: 'A', account: 'Debtors', debit: '100', credit: '0' },
      { party: 'A', account: 'Debtors', debit: 0, credit: 40 },
      { party: 'A', account: 'Creditors', debit: '0', credit: '25.5' },
      { party: 'B', account: 'Creditors', debit: 10, credit: 60 },
    ],
    accountTypes
  );

  t.deepEqual(balances.get('A'), { receivable: 60, payable: -25.5 });
  t.deepEqual(balances.get('B'), { receivable: 0, payable: -50 });
  t.equal(balances.size, 2);
  t.end();
});

test('foldPartyBalances: skips non-tracked accounts and empty parties', (t) => {
  const balances = foldPartyBalances(
    [
      { party: 'A', account: 'Cash', debit: 999, credit: 0 },
      { party: '', account: 'Debtors', debit: 5, credit: 0 },
      { party: null, account: 'Debtors', debit: 5, credit: 0 },
      { party: 'B', account: 'Debtors', debit: 12, credit: 0 },
    ],
    accountTypes
  );

  t.notOk(balances.has('A'));
  t.deepEqual([...balances.keys()], ['B']);
  t.end();
});

test('foldPartyBalances: drops zero balances, rounds to cents', (t) => {
  const balances = foldPartyBalances(
    [
      { party: 'Zero', account: 'Debtors', debit: 50, credit: 50 },
      { party: 'Zero', account: 'Creditors', debit: 20, credit: 20 },
      { party: 'Float', account: 'Debtors', debit: 0.1, credit: 0 },
      { party: 'Float', account: 'Debtors', debit: 0.2, credit: 0 },
    ],
    accountTypes
  );

  t.notOk(balances.has('Zero'));
  t.equal(balances.get('Float')?.receivable, 0.3);
  t.end();
});

test('foldPartyBalances: handles malformed amounts as zero', (t) => {
  const balances = foldPartyBalances(
    [{ party: 'A', account: 'Debtors', debit: 'bogus', credit: null }],
    accountTypes
  );

  t.notOk(balances.has('A'), 'NaN amounts fold to zero and get dropped');
  t.end();
});

test('getLetterHtml: renders company, party, balance and invoices', (t) => {
  const html = getLetterHtml(getLetter());

  t.ok(html.includes('Näidis OÜ'), 'company name');
  t.ok(html.includes('Registry code'), 'registry code label');
  t.ok(html.includes('12345678'), 'company registry code');
  t.ok(html.includes('EE123456789'), 'company VAT number');
  t.ok(html.includes('Klient AS'), 'party name');
  t.ok(html.includes('87654321'), 'party registry code');
  t.ok(html.includes('Dec 31, 2026'), 'as-of date');
  t.ok(html.includes('1,200.00 EUR'), 'balance');
  t.ok(html.includes('SINV-1001'), 'invoice name');
  t.ok(html.includes('700.00'), 'invoice outstanding');
  t.ok(html.includes('Dec 2, 2026'), 'invoice date');
  t.equal(html.match(/<tbody>[\s\S]*?<\/tbody>/)![0].match(/<tr>/g)!.length, 2);
  t.end();
});

test('getLetterHtml: escapes markup in names', (t) => {
  const html = getLetterHtml(getLetter({ partyName: 'Evil <b>&Co' }));

  t.ok(html.includes('Evil &lt;b&gt;&amp;Co'));
  t.notOk(html.includes('Evil <b>'));
  t.end();
});

test('getLetterHtml: direction flips the statement', (t) => {
  const theyOwe = getLetterHtml(getLetter({ weOwe: false }));
  const weOwe = getLetterHtml(getLetter({ weOwe: true }));

  t.notEqual(theyOwe, weOwe);
  t.ok(theyOwe.includes('1,200.00 EUR'));
  t.ok(weOwe.includes('1,200.00 EUR'));
  t.end();
});

test('getLetterHtml: no invoice table when there are no open invoices', (t) => {
  const html = getLetterHtml(getLetter({ invoices: [] }));

  t.notOk(html.includes('<table'));
  t.ok(html.includes('no open invoices'));
  t.end();
});

test('getConfirmationDocumentHtml: one page break between each letter', (t) => {
  const letters = [
    getLetter({ partyName: 'Party One' }),
    getLetter({ partyName: 'Party Two' }),
    getLetter({ partyName: 'Party Three' }),
  ];

  const html = getConfirmationDocumentHtml(letters);
  t.equal(html.match(/page-break-after: always/g)!.length, 2);
  t.ok(html.includes('Party One'));
  t.ok(html.includes('Party Two'));
  t.ok(html.includes('Party Three'));

  const single = getConfirmationDocumentHtml([getLetter()]);
  t.notOk(single.includes('page-break-after'));
  t.end();
});
