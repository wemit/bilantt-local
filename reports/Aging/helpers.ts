import { DateTime } from 'luxon';

export interface RawAgingInvoice {
  name: string;
  party: string;
  date: string;
  outstandingAmount: string | number | null;
}

export interface AgingEntry {
  party: string;
  invoice: string;
  date: string;
  ageDays: number;
  outstanding: number;
  buckets: number[];
}

export interface AgingTotals {
  outstanding: number;
  buckets: number[];
}

export interface AgingPartyGroup {
  party: string;
  entries: AgingEntry[];
  total: AgingTotals;
}

export const AGING_BUCKET_LABELS = ['0–30', '31–60', '61–90', '91+'];

export function getAgeDays(invoiceDate: string, asOfDate: string): number {
  const inv = DateTime.fromISO(invoiceDate).startOf('day');
  const asOf = DateTime.fromISO(asOfDate).startOf('day');
  return Math.round(asOf.diff(inv, 'days').days);
}

export function getBucketIndex(ageDays: number): number {
  if (ageDays <= 30) {
    return 0;
  }

  if (ageDays <= 60) {
    return 1;
  }

  if (ageDays <= 90) {
    return 2;
  }

  return 3;
}

export function buildAgingGroups(
  invoices: RawAgingInvoice[],
  asOfDate: string
): { groups: AgingPartyGroup[]; grandTotal: AgingTotals } {
  const byParty = new Map<string, AgingEntry[]>();

  for (const inv of invoices) {
    const outstanding = toNumber(inv.outstandingAmount);
    if (outstanding <= 0) {
      continue;
    }

    const ageDays = getAgeDays(inv.date, asOfDate);
    const buckets = [0, 0, 0, 0];
    buckets[getBucketIndex(ageDays)] = outstanding;

    const list = byParty.get(inv.party) ?? [];
    list.push({
      party: inv.party,
      invoice: inv.name,
      date: inv.date,
      // outstanding is current-state; invoices dated after asOfDate stay at age 0
      ageDays: Math.max(0, ageDays),
      outstanding,
      buckets,
    });
    byParty.set(inv.party, list);
  }

  const groups: AgingPartyGroup[] = [];
  for (const party of [...byParty.keys()].sort()) {
    const entries = byParty
      .get(party)!
      .sort((a, b) => a.date.localeCompare(b.date));
    groups.push({ party, entries, total: sumTotals(entries) });
  }

  return { groups, grandTotal: sumTotals(groups.map((g) => g.total)) };
}

function sumTotals(
  items: { outstanding: number; buckets: number[] }[]
): AgingTotals {
  const total: AgingTotals = { outstanding: 0, buckets: [0, 0, 0, 0] };
  for (const item of items) {
    total.outstanding = round2(total.outstanding + item.outstanding);
    for (let i = 0; i < total.buckets.length; i++) {
      total.buckets[i] = round2(total.buckets[i] + item.buckets[i]);
    }
  }

  return total;
}

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
