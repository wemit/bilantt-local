import test from 'tape';
import { buildAgingGroups, getAgeDays, getBucketIndex } from '../helpers';

test('getAgeDays: whole-day difference between invoice date and as-of date', (t) => {
  t.equal(getAgeDays('2026-01-01', '2026-01-01'), 0);
  t.equal(getAgeDays('2026-01-01', '2026-01-31'), 30);
  t.equal(getAgeDays('2026-01-01', '2026-02-01'), 31);
  t.equal(getAgeDays('2025-07-20', '2026-07-20'), 365);
  t.equal(getAgeDays('2026-07-20', '2026-07-10'), -10);
  t.equal(getAgeDays('2026-01-01T15:45:00.000', '2026-01-31'), 30);
  t.end();
});

test('getBucketIndex: boundaries at 30/60/90', (t) => {
  t.equal(getBucketIndex(0), 0);
  t.equal(getBucketIndex(30), 0);
  t.equal(getBucketIndex(31), 1);
  t.equal(getBucketIndex(60), 1);
  t.equal(getBucketIndex(61), 2);
  t.equal(getBucketIndex(90), 2);
  t.equal(getBucketIndex(91), 3);
  t.equal(getBucketIndex(400), 3);
  t.equal(getBucketIndex(-5), 0);
  t.end();
});

test('buildAgingGroups: groups by party, buckets by age, totals', (t) => {
  const invoices = [
    {
      name: 'SINV-1003',
      party: 'Beta OÜ',
      date: '2026-06-25',
      outstandingAmount: '150.5',
    },
    {
      name: 'SINV-1001',
      party: 'Alpha AS',
      date: '2026-03-01',
      outstandingAmount: '100',
    },
    {
      name: 'SINV-1002',
      party: 'Alpha AS',
      date: '2026-05-30',
      outstandingAmount: '250.25',
    },
    {
      name: 'SINV-1000',
      party: 'Alpha AS',
      date: '2026-07-01',
      outstandingAmount: '0',
    },
    {
      name: 'SINV-0999',
      party: 'Gamma OÜ',
      date: '2025-12-01',
      outstandingAmount: 75,
    },
  ];

  const { groups, grandTotal } = buildAgingGroups(invoices, '2026-07-20');

  t.deepEqual(
    groups.map((g) => g.party),
    ['Alpha AS', 'Beta OÜ', 'Gamma OÜ'],
    'parties sorted, zero-outstanding party rows dropped'
  );

  const alpha = groups[0];
  t.deepEqual(
    alpha.entries.map((e) => e.invoice),
    ['SINV-1001', 'SINV-1002'],
    'entries sorted by date, zero-outstanding invoice excluded'
  );
  t.equal(alpha.entries[0].ageDays, 141);
  t.deepEqual(alpha.entries[0].buckets, [0, 0, 0, 100]);
  t.equal(alpha.entries[1].ageDays, 51);
  t.deepEqual(alpha.entries[1].buckets, [0, 250.25, 0, 0]);
  t.equal(alpha.total.outstanding, 350.25);
  t.deepEqual(alpha.total.buckets, [0, 250.25, 0, 100]);

  t.equal(groups[1].entries[0].ageDays, 25);
  t.deepEqual(groups[1].entries[0].buckets, [150.5, 0, 0, 0]);

  t.equal(groups[2].entries[0].ageDays, 231);
  t.deepEqual(groups[2].entries[0].buckets, [0, 0, 0, 75]);

  t.equal(grandTotal.outstanding, 575.75);
  t.deepEqual(grandTotal.buckets, [150.5, 250.25, 0, 175]);
  t.end();
});

test('buildAgingGroups: invoice dated after as-of date stays with age 0', (t) => {
  const { groups } = buildAgingGroups(
    [
      {
        name: 'SINV-2',
        party: 'X',
        date: '2026-08-01',
        outstandingAmount: 40,
      },
    ],
    '2026-07-20'
  );

  t.equal(groups.length, 1);
  t.equal(groups[0].entries[0].ageDays, 0);
  t.deepEqual(groups[0].entries[0].buckets, [40, 0, 0, 0]);
  t.end();
});

test('buildAgingGroups: null and non-numeric outstanding excluded', (t) => {
  const { groups, grandTotal } = buildAgingGroups(
    [
      {
        name: 'PINV-1',
        party: 'Y',
        date: '2026-07-01',
        outstandingAmount: null,
      },
      {
        name: 'PINV-2',
        party: 'Y',
        date: '2026-07-01',
        outstandingAmount: 'abc',
      },
      {
        name: 'PINV-3',
        party: 'Y',
        date: '2026-07-01',
        outstandingAmount: '-5',
      },
    ],
    '2026-07-20'
  );

  t.equal(groups.length, 0);
  t.equal(grandTotal.outstanding, 0);
  t.deepEqual(grandTotal.buckets, [0, 0, 0, 0]);
  t.end();
});
