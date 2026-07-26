import { t } from 'fyo';

export type BalanceAccountType = 'Receivable' | 'Payable';

export interface BalanceLedgerRow {
  party?: string | null;
  account: string;
  debit?: string | number | null;
  credit?: string | number | null;
}

export interface PartyBalance {
  receivable: number;
  payable: number;
}

export interface LetterInvoiceRow {
  name: string;
  date: string;
  grandTotal: string;
  outstanding: string;
}

export interface BalanceLetter {
  companyName: string;
  companyRegistryCode: string;
  companyVatNumber: string;
  partyName: string;
  partyRegistryCode: string;
  asOfDate: string;
  balance: string;
  weOwe: boolean;
  invoices: LetterInvoiceRow[];
}

export function foldPartyBalances(
  rows: BalanceLedgerRow[],
  accountTypes: Record<string, BalanceAccountType>
): Map<string, PartyBalance> {
  const balances = new Map<string, PartyBalance>();
  for (const row of rows) {
    const accountType = accountTypes[row.account];
    if (!row.party || !accountType) {
      continue;
    }

    const balance = balances.get(row.party) ?? { receivable: 0, payable: 0 };
    const net = toNumber(row.debit) - toNumber(row.credit);
    if (accountType === 'Receivable') {
      balance.receivable += net;
    } else {
      balance.payable += net;
    }

    balances.set(row.party, balance);
  }

  for (const [party, balance] of balances) {
    balance.receivable = round2(balance.receivable);
    balance.payable = round2(balance.payable);
    if (balance.receivable === 0 && balance.payable === 0) {
      balances.delete(party);
    }
  }

  return balances;
}

export function getLetterHtml(letter: BalanceLetter): string {
  const statement = letter.weOwe
    ? t`According to our accounting records, the amount payable by ${letter.companyName} to ${letter.partyName} as of ${letter.asOfDate} is ${letter.balance}.`
    : t`According to our accounting records, the amount payable by ${letter.partyName} to ${letter.companyName} as of ${letter.asOfDate} is ${letter.balance}.`;

  const companyLines = [
    letter.companyRegistryCode
      ? `${t`Registry code`}: ${letter.companyRegistryCode}`
      : '',
    letter.companyVatNumber
      ? `${t`VAT number`}: ${letter.companyVatNumber}`
      : '',
  ]
    .filter(Boolean)
    .map((line) => `<p style="margin: 0;">${esc(line)}</p>`)
    .join('');

  const partyLines = letter.partyRegistryCode
    ? `<p style="margin: 0;">${esc(
        `${t`Registry code`}: ${letter.partyRegistryCode}`
      )}</p>`
    : '';

  return `<section style="font-family: sans-serif; font-size: 12px; line-height: 1.5; color: #1f2937; padding: 2cm;">
  <h1 style="font-size: 20px; margin: 0 0 4px;">${esc(
    t`Balance Confirmation`
  )}</h1>
  <p style="margin: 0 0 16px;">${esc(t`As of ${letter.asOfDate}`)}</p>
  <p style="margin: 0;"><strong>${esc(letter.companyName)}</strong></p>
  ${companyLines}
  <p style="margin: 16px 0 0;">${esc(t`To`)}: <strong>${esc(
    letter.partyName
  )}</strong></p>
  ${partyLines}
  <p style="margin: 16px 0;">${esc(statement)}</p>
  <p style="margin: 0 0 16px;">${esc(
    t`Please confirm whether this balance matches your records. If it does not, please reply with a statement from your records.`
  )}</p>
  ${getInvoiceSection(letter.invoices)}
  <p style="margin: 40px 0 0;">${esc(
    t`Confirmed by (name, signature)`
  )}: ________________________________</p>
  <p style="margin: 12px 0 0;">${esc(t`Date`)}: ____________________</p>
</section>`;
}

export function getConfirmationDocumentHtml(letters: BalanceLetter[]): string {
  return letters
    .map(getLetterHtml)
    .join('<div style="page-break-after: always"></div>');
}

function getInvoiceSection(invoices: LetterInvoiceRow[]): string {
  if (!invoices.length) {
    return `<p style="margin: 0 0 16px;">${esc(
      t`There are no open invoices related to this balance.`
    )}</p>`;
  }

  const cell = 'padding: 4px 8px; border: 1px solid #d1d5db;';
  const rows = invoices
    .map(
      (inv) => `<tr>
      <td style="${cell}">${esc(inv.name)}</td>
      <td style="${cell}">${esc(inv.date)}</td>
      <td style="${cell} text-align: right;">${esc(inv.grandTotal)}</td>
      <td style="${cell} text-align: right;">${esc(inv.outstanding)}</td>
    </tr>`
    )
    .join('');

  return `<h2 style="font-size: 14px; margin: 0 0 8px;">${esc(
    t`Open invoices`
  )}</h2>
  <table style="border-collapse: collapse; width: 100%; margin: 0 0 16px;">
    <thead>
      <tr>
        <th style="${cell} text-align: left;">${esc(t`Invoice`)}</th>
        <th style="${cell} text-align: left;">${esc(t`Date`)}</th>
        <th style="${cell} text-align: right;">${esc(t`Total`)}</th>
        <th style="${cell} text-align: right;">${esc(t`Outstanding`)}</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
