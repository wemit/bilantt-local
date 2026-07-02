import { ClassifiedRow, ClassifierRule, BankRow } from './types';
import { DEFAULT_RULES } from './rules';
import { PartyClassification, resolveFromParties } from './partyResolver';
import { HistoryEntry, resolveFromHistory } from './historyResolver';

export interface ClassifyOptions {
  rules?: ClassifierRule[];
  parties?: PartyClassification[];
  history?: HistoryEntry[];
}

export function classifyRows(
  rows: BankRow[],
  opts: ClassifyOptions = {}
): ClassifiedRow[] {
  return rows.map((row) => classifyRow(row, opts));
}

export function classifyRow(
  row: BankRow,
  opts: ClassifyOptions = {}
): ClassifiedRow {
  const { rules = DEFAULT_RULES, parties, history } = opts;

  if (parties && parties.length > 0) {
    const match = resolveFromParties(row, parties);
    if (match) {
      return {
        ...row,
        proposedVatCode: match.vatCode,
        proposedAccount: match.account,
        side: match.side,
        matchedRuleId: `party:${match.partyName}`,
      };
    }
  }

  if (history && history.length > 0) {
    const match = resolveFromHistory(row, history);
    if (match) {
      return {
        ...row,
        proposedVatCode: match.vatCode,
        proposedAccount: match.account,
        side: match.side,
        matchedRuleId: 'history',
      };
    }
  }

  for (const rule of rules) {
    if (matches(row, rule)) {
      return {
        ...row,
        proposedVatCode: rule.vatCode,
        proposedAccount: rule.account,
        side: rule.side,
        matchedRuleId: rule.id,
      };
    }
  }

  return {
    ...row,
    proposedVatCode: null,
    proposedAccount:
      row.amount >= 0 ? '1200 - Trade Receivables' : '2110 - Trade Payables',
    side: 'unknown',
  };
}

function matches(row: BankRow, rule: ClassifierRule): boolean {
  const m = rule.match;

  if (m.sign === 'debit' && row.amount >= 0) return false;
  if (m.sign === 'credit' && row.amount < 0) return false;

  if (
    m.counterpartyIban &&
    row.counterpartyIban?.toUpperCase() !== m.counterpartyIban.toUpperCase()
  ) {
    return false;
  }

  if (m.counterpartyNameContains) {
    const needle = m.counterpartyNameContains.toLowerCase();
    if (!(row.counterpartyName ?? '').toLowerCase().includes(needle)) {
      return false;
    }
  }

  if (m.remittanceContains) {
    const needle = m.remittanceContains.toLowerCase();
    if (!(row.remittance ?? '').toLowerCase().includes(needle)) {
      return false;
    }
  }

  return true;
}
