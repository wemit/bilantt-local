import { Fyo } from 'fyo';
import { VAT_CODES, VatCodeName } from 'regional/ee';

export async function createEstonianRecords(fyo: Fyo) {
  await createTaxes(fyo);
}

interface TaxAccountMap {
  outputAccount: string;

  inputAccount: string;

  reverseChargePayable?: string;

  reverseChargeReceivable?: string;
}

function getTaxAccounts(code: VatCodeName): TaxAccountMap | null {
  switch (code) {
    case 'EE24':
    case 'EE13':
    case 'EE9':
      return {
        outputAccount: '2310 - Output VAT',
        inputAccount: '2311 - Input VAT',
      };
    case 'EU_RC_GOODS':
    case 'EU_RC_SERVICES':
    case 'NON_EU_RC':
      return {
        outputAccount: '2310 - Output VAT',
        inputAccount: '2311 - Input VAT',
        reverseChargePayable: '2314 - RC VAT Payable',
        reverseChargeReceivable: '2314 - RC VAT Receivable',
      };
    // Rate-0 templates let invoices carry the code with no ledger impact.
    case 'EE0':
    case 'ZERO_EU_GOODS':
    case 'ZERO_EU_SERVICES':
    case 'ZERO_EU_TRIANGLE':
    case 'ZERO_EXPORT':
    case 'EXEMPT':
      return {
        outputAccount: '2310 - Output VAT',
        inputAccount: '2311 - Input VAT',
      };
    case 'ZERO_EU_B2B':
    // No standard Tax template: margin (KMS §41/§42) taxes only the margin;
    // OSS (§43) and EU establishment use a foreign rate + separate accounts.
    case 'MARGIN_24':
    case 'MARGIN_22':
    case 'MARGIN_9':
    case 'MARGIN_5':
    case 'OSS_SALES':
    case 'EU_FIXED_ESTAB':
      return null;
    default:
      return null;
  }
}

async function createTaxes(fyo: Fyo) {
  for (const code of Object.keys(VAT_CODES) as VatCodeName[]) {
    const spec = VAT_CODES[code];
    const accounts = getTaxAccounts(code);
    if (accounts === null) continue;

    const exists = await fyo.db.exists('Tax', code);
    if (exists) continue;

    const newTax = fyo.doc.getNewDoc('Tax', {
      name: code,
      details: [
        {
          account: accounts.outputAccount,
          rate: spec.rate,
        },
      ],
    });
    await newTax.sync();
  }
}
