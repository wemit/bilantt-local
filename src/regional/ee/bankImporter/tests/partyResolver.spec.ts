import test from 'tape';
import {
  mapPartyVatType,
  resolveFromParties,
  PartyClassification,
} from '../partyResolver';
import { BankRow } from '../types';

function row(over: Partial<BankRow> = {}): BankRow {
  return {
    accountIban: 'EE382200221020145685',
    date: '2026-06-03',
    amount: -77.98,
    currency: 'EUR',
    archivalId: 'X',
    ...over,
  };
}

test('mapPartyVatType: NON_EU purchase → NON_EU_RC, sale → ZERO_EXPORT', (t) => {
  t.equal(mapPartyVatType('NON_EU', 'purchase'), 'NON_EU_RC');
  t.equal(mapPartyVatType('NON_EU', 'sales'), 'ZERO_EXPORT');
  t.end();
});

test('mapPartyVatType: EU_B2B purchase → EU_RC_SERVICES', (t) => {
  t.equal(mapPartyVatType('EU_B2B', 'purchase'), 'EU_RC_SERVICES');
  t.equal(mapPartyVatType('EU_B2B', 'sales'), 'ZERO_EU_SERVICES');
  t.end();
});

test('mapPartyVatType: EE_UNREGISTERED purchase → no VAT', (t) => {
  t.equal(mapPartyVatType('EE_UNREGISTERED', 'purchase'), null);
  t.equal(mapPartyVatType(undefined, 'purchase'), null);
  t.end();
});

test('resolveFromParties: Anthropic debit → defaultAccount + NON_EU_RC', (t) => {
  const parties: PartyClassification[] = [
    {
      name: 'Anthropic',
      role: 'Supplier',
      defaultAccount: '4320 - IT Services',
      partyVatType: 'NON_EU',
    },
  ];
  const m = resolveFromParties(
    row({ counterpartyName: 'ANTHROPIC* CLAUDE SUB' }),
    parties
  );
  t.ok(m);
  t.equal(m?.account, '4320 - IT Services');
  t.equal(m?.vatCode, 'NON_EU_RC');
  t.equal(m?.side, 'purchase');
  t.equal(m?.partyName, 'Anthropic');
  t.end();
});

test('resolveFromParties: matches on VAT number in remittance', (t) => {
  const parties: PartyClassification[] = [
    {
      name: 'Some GmbH',
      defaultAccount: '4320 - IT Services',
      partyVatType: 'EU_B2B',
      vatNumber: 'DE123456789',
    },
  ];
  const m = resolveFromParties(
    row({ counterpartyName: 'Unknown', remittance: 'Invoice DE123456789' }),
    parties
  );
  t.equal(m?.vatCode, 'EU_RC_SERVICES');
  t.end();
});

test('resolveFromParties: no defaultAccount → no match', (t) => {
  const parties: PartyClassification[] = [
    { name: 'Anthropic', partyVatType: 'NON_EU' },
  ];
  t.equal(
    resolveFromParties(
      row({ counterpartyName: 'ANTHROPIC* CLAUDE SUB' }),
      parties
    ),
    null
  );
  t.end();
});

test('resolveFromParties: longest party name wins', (t) => {
  const parties: PartyClassification[] = [
    {
      name: 'Apple',
      defaultAccount: '4320 - IT Services',
      partyVatType: 'NON_EU',
    },
    {
      name: 'Apple Distribution International',
      defaultAccount: '4310 - Telephone and Internet',
      partyVatType: 'EU_B2B',
    },
  ];
  const m = resolveFromParties(
    row({ counterpartyName: 'APPLE DISTRIBUTION INTERNATIONAL LTD' }),
    parties
  );
  t.equal(m?.account, '4310 - Telephone and Internet');
  t.end();
});

test('resolveFromParties: exact IBAN match wins over name', (t) => {
  const parties: PartyClassification[] = [
    {
      name: 'Wrong Vendor',
      defaultAccount: '4395 - Other Operating Expenses',
      partyVatType: 'EE_REGISTERED',
      iban: 'EE111111111111111111',
    },
    {
      name: 'Right Vendor',
      defaultAccount: '4320 - IT Services',
      partyVatType: 'EE_REGISTERED',
      iban: 'EE222222222222222222',
    },
  ];
  const m = resolveFromParties(
    row({
      counterpartyName: 'Wrong Vendor OU',
      counterpartyIban: 'ee222222222222222222',
    }),
    parties
  );
  t.equal(m?.account, '4320 - IT Services');
  t.equal(m?.partyName, 'Right Vendor');
  t.end();
});
