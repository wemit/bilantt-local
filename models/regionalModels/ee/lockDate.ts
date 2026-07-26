import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { ValidationError } from 'fyo/utils/errors';
import { DateTime } from 'luxon';

type DateValue = Date | string | null | undefined;

function toISODate(value: DateValue): string | null {
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate();
  }

  if (typeof value === 'string' && value) {
    return DateTime.fromISO(value).toISODate();
  }

  return null;
}

function assertDateNotLocked(value: DateValue, lockDate: string) {
  const date = toISODate(value);
  if (date && date <= lockDate) {
    throw new ValidationError(
      t`Date ${date} is in a locked period. Documents dated on or before ${lockDate} cannot be changed.`
    );
  }
}

export async function assertNotLocked(doc: Doc & { date?: DateValue }) {
  const settings: (Doc & { lockDate?: DateValue }) | undefined =
    doc.fyo.singles.AccountingSettings;
  const lockDate = toISODate(settings?.lockDate);
  if (!lockDate) {
    return;
  }

  assertDateNotLocked(doc.date, lockDate);

  if (doc.inserted && doc.name) {
    const stored = await doc.fyo.db.get(doc.schemaName, doc.name, 'date');
    assertDateNotLocked(stored.date as DateValue, lockDate);
  }
}
