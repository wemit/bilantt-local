import { VatCodeName } from 'regional/ee';

export interface BankRow {
  accountIban: string;
  documentNumber?: string;
  date: string;
  counterpartyIban?: string;
  counterpartyName?: string;
  amount: number;
  currency: string;
  remittance?: string;
  referenceNumber?: string;
  archivalId: string;
  bic?: string;
}

export type ClassifiedSide = 'sales' | 'purchase' | 'fee' | 'transfer' | 'unknown';

export interface ClassifiedRow extends BankRow {
  proposedVatCode: VatCodeName | null;
  proposedAccount: string;
  side: ClassifiedSide;
  matchedRuleId?: string;
  isDuplicate?: boolean;
}

export interface ClassifierRule {
  id: string;
  match: {
    counterpartyIban?: string;
    counterpartyNameContains?: string;
    remittanceContains?: string;
    sign?: 'debit' | 'credit';
  };
  account: string;
  vatCode: VatCodeName | null;
  side: ClassifiedSide;
}

const EE_IBAN_BANK_CODES: Record<string, string> = {
  '77': 'lhv',
  '10': 'seb',
  '22': 'swedbank',
  '96': 'luminor',
  '42': 'coop',
};

export function detectImportBank(accountIban: string): string {
  const iban = accountIban.replace(/\s/g, '').toUpperCase();
  if (!iban.startsWith('EE')) return 'unknown';
  return EE_IBAN_BANK_CODES[iban.slice(4, 6)] ?? 'unknown';
}
