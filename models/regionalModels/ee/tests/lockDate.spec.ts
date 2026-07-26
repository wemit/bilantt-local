import { ValidationError } from 'fyo/utils/errors';
import test from 'tape';
import { assertNotLocked } from '../lockDate';

type LockDoc = Parameters<typeof assertNotLocked>[0];

interface FakeDocArgs {
  date?: Date | string | null;
  lockDate?: Date | string | null;
  inserted?: boolean;
  storedDate?: Date | string | null;
}

function makeDoc({ date, lockDate, inserted, storedDate }: FakeDocArgs) {
  return {
    date,
    inserted: inserted ?? false,
    name: 'TEST-0001',
    schemaName: 'SalesInvoice',
    fyo: {
      singles: { AccountingSettings: { lockDate } },
      db: {
        // eslint-disable-next-line @typescript-eslint/require-await
        get: async () => ({ date: storedDate }),
      },
    },
  } as unknown as LockDoc;
}

async function throws(t: test.Test, doc: LockDoc, message: string) {
  try {
    await assertNotLocked(doc);
    t.fail(message);
  } catch (err) {
    t.ok(err instanceof ValidationError, message);
  }
}

async function passes(t: test.Test, doc: LockDoc, message: string) {
  try {
    await assertNotLocked(doc);
    t.pass(message);
  } catch {
    t.fail(message);
  }
}

test('lockDate: no lock date set, any date passes', async (t) => {
  await passes(
    t,
    makeDoc({ date: new Date('2026-01-15') }),
    'undefined lock date'
  );
  await passes(
    t,
    makeDoc({ date: new Date('2026-01-15'), lockDate: null }),
    'null lock date'
  );
  t.end();
});

test('lockDate: date after lock date passes', async (t) => {
  await passes(
    t,
    makeDoc({ date: new Date('2026-02-01'), lockDate: new Date('2026-01-31') }),
    'day after lock'
  );
  t.end();
});

test('lockDate: date on lock date throws', async (t) => {
  await throws(
    t,
    makeDoc({ date: new Date('2026-01-31'), lockDate: new Date('2026-01-31') }),
    'same day locked'
  );
  t.end();
});

test('lockDate: date before lock date throws', async (t) => {
  await throws(
    t,
    makeDoc({ date: new Date('2025-12-15'), lockDate: new Date('2026-01-31') }),
    'earlier day locked'
  );
  t.end();
});

test('lockDate: ISO string values are compared correctly', async (t) => {
  await throws(
    t,
    makeDoc({ date: '2026-01-10', lockDate: '2026-01-31' }),
    'string date in locked period'
  );
  await passes(
    t,
    makeDoc({ date: '2026-02-10', lockDate: '2026-01-31' }),
    'string date after lock'
  );
  await throws(
    t,
    makeDoc({ date: '2026-01-10T10:30:00.000Z', lockDate: '2026-01-31' }),
    'datetime string in locked period'
  );
  t.end();
});

test('lockDate: unset date passes', async (t) => {
  await passes(
    t,
    makeDoc({ lockDate: new Date('2026-01-31') }),
    'no date on doc'
  );
  t.end();
});

test('lockDate: re-dating out of a locked period throws', async (t) => {
  await throws(
    t,
    makeDoc({
      date: new Date('2026-02-15'),
      lockDate: new Date('2026-01-31'),
      inserted: true,
      storedDate: new Date('2026-01-10'),
    }),
    'stored date locked'
  );
  t.end();
});

test('lockDate: existing doc fully outside locked period passes', async (t) => {
  await passes(
    t,
    makeDoc({
      date: new Date('2026-03-01'),
      lockDate: new Date('2026-01-31'),
      inserted: true,
      storedDate: new Date('2026-02-15'),
    }),
    'stored and new date after lock'
  );
  t.end();
});
