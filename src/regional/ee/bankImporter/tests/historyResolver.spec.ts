import test from 'tape';
import { resolveFromHistory, HistoryEntry } from '../historyResolver';
import { BankRow } from '../types';

function row(over: Partial<BankRow> = {}): BankRow {
  return {
    accountIban: 'EE382200221020145685',
    date: '2026-06-03',
    amount: -42,
    currency: 'EUR',
    archivalId: 'X',
    ...over,
  };
}

test('resolveFromHistory: reuses a prior counterparty mapping', (t) => {
  const history: HistoryEntry[] = [
    {
      counterparty: 'ANTHROPIC* CLAUDE SUB',
      account: '4320 - IT Services',
      vatCode: 'NON_EU_RC',
    },
  ];
  const m = resolveFromHistory(
    row({ counterpartyName: 'ANTHROPIC* CLAUDE SUB' }),
    history
  );
  t.equal(m?.account, '4320 - IT Services');
  t.equal(m?.vatCode, 'NON_EU_RC');
  t.equal(m?.side, 'purchase');
  t.end();
});

test('resolveFromHistory: most recent entry wins (first in list)', (t) => {
  const history: HistoryEntry[] = [
    {
      counterparty: 'Figma',
      account: '4320 - IT Services',
      vatCode: 'NON_EU_RC',
    },
    { counterparty: 'Figma', account: '4395 - Other', vatCode: null },
  ];
  const m = resolveFromHistory(row({ counterpartyName: 'FIGMA INC' }), history);
  t.equal(m?.account, '4320 - IT Services');
  t.end();
});

test('resolveFromHistory: no match → null', (t) => {
  const history: HistoryEntry[] = [
    { counterparty: 'Figma', account: '4320 - IT Services', vatCode: null },
  ];
  t.equal(
    resolveFromHistory(row({ counterpartyName: 'Stripe' }), history),
    null
  );
  t.end();
});
