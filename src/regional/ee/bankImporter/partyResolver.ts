import { VatCodeName } from 'regional/ee';
import { BankRow, ClassifiedSide } from './types';

export type PartyVatType =
  | 'EE_REGISTERED'
  | 'EE_UNREGISTERED'
  | 'EU_B2B'
  | 'EU_B2C'
  | 'NON_EU'
  | 'EXEMPT';

export interface PartyClassification {
  name: string;
  role?: 'Both' | 'Supplier' | 'Customer';
  defaultAccount?: string | null;
  partyVatType?: PartyVatType | null;
  vatNumber?: string | null;
  iban?: string | null;
}

export interface PartyMatch {
  account: string;
  vatCode: VatCodeName | null;
  side: ClassifiedSide;
  partyName: string;
}

export function mapPartyVatType(
  vatType: PartyVatType | null | undefined,
  side: 'purchase' | 'sales'
): VatCodeName | null {
  switch (vatType) {
    case 'EE_REGISTERED':
      return 'EE24';
    case 'EE_UNREGISTERED':
      return side === 'sales' ? 'EE0' : null;
    case 'EU_B2B':
      return side === 'sales' ? 'ZERO_EU_SERVICES' : 'EU_RC_SERVICES';
    case 'EU_B2C':
      return side === 'sales' ? 'EE24' : null;
    case 'NON_EU':
      return side === 'sales' ? 'ZERO_EXPORT' : 'NON_EU_RC';
    case 'EXEMPT':
      return 'EXEMPT';
    default:
      return null;
  }
}

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toMatch(
  party: PartyClassification,
  side: 'purchase' | 'sales'
): PartyMatch {
  return {
    account: party.defaultAccount!,
    vatCode: mapPartyVatType(party.partyVatType, side),
    side,
    partyName: party.name,
  };
}

export function resolveFromParties(
  row: BankRow,
  parties: PartyClassification[]
): PartyMatch | null {
  const side: 'purchase' | 'sales' = row.amount < 0 ? 'purchase' : 'sales';
  const withAccount = parties.filter((p) => p.defaultAccount);

  const rowIban = (row.counterpartyIban ?? '').toUpperCase();
  if (rowIban) {
    const byIban = withAccount.find(
      (p) => (p.iban ?? '').toUpperCase() === rowIban
    );
    if (byIban) return toMatch(byIban, side);
  }

  const haystack = norm(
    `${row.counterpartyName ?? ''} ${row.remittance ?? ''}`
  );
  if (!haystack) return null;

  const candidates = withAccount
    .map((p) => ({ party: p, key: norm(p.name), vat: norm(p.vatNumber) }))
    .sort((a, b) => b.key.length - a.key.length);

  for (const c of candidates) {
    const byVat = c.vat.length >= 4 && haystack.includes(c.vat);
    const byName = c.key.length >= 3 && haystack.includes(c.key);
    if (byVat || byName) return toMatch(c.party, side);
  }

  return null;
}
