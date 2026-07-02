import { VatCodeName } from 'regional/ee';
import { BankRow, ClassifiedSide } from './types';

export interface HistoryEntry {
  counterparty: string;
  account: string;
  vatCode: VatCodeName | null;
}

export interface HistoryMatch {
  account: string;
  vatCode: VatCodeName | null;
  side: ClassifiedSide;
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function resolveFromHistory(
  row: BankRow,
  history: HistoryEntry[]
): HistoryMatch | null {
  const rowKey = norm(row.counterpartyName);
  if (!rowKey) return null;
  const side: ClassifiedSide = row.amount < 0 ? 'purchase' : 'sales';

  for (const h of history) {
    const key = norm(h.counterparty);
    if (key.length >= 3 && (rowKey === key || rowKey.includes(key))) {
      return { account: h.account, vatCode: h.vatCode, side };
    }
  }

  return null;
}
