import { t } from 'fyo';
import { Doc } from 'fyo/model/doc';
import { FormulaMap, ListsMap, ValidationMap } from 'fyo/model/types';
import { validateEmail } from 'fyo/model/validationFunction';
import { DateTime } from 'luxon';
import { getCountryInfo, getFiscalYear } from 'utils/misc';
// EE: bank suggestions in setup come from the verified Estonian COA
import eeCOA from '../../../fixtures/verified/ee.json';

function getCurrencyList(): { countryCode: string; name: string }[] {
  const result: { countryCode: string; name: string }[] = [];
  const countryInfo = getCountryInfo();
  for (const info of Object.values(countryInfo)) {
    const { currency, code } = info ?? {};
    if (typeof currency !== 'string' || typeof code !== 'string') {
      continue;
    }

    result.push({ name: currency, countryCode: code });
  }
  return result;
}

// CUSTOM: resolution registry — demo company and tests need 'in';
// prune only WIZARD_COA_CODES
export function getCOAList() {
  return [
    { name: t`Standard Chart of Accounts`, countryCode: '' },
    { countryCode: 'ee', name: 'Estonia - Chart of Accounts' },
  ];
}

// CUSTOM: wizard dropdown subset
const WIZARD_COA_CODES = ['', 'ee'];

export function getCOAWizardList() {
  return getCOAList().filter(({ countryCode }) =>
    WIZARD_COA_CODES.includes(countryCode)
  );
}

// EE: Bank-type leaves of the verified COA ("1010 - LHV", …)
function getEstonianBankAccounts(): string[] {
  const names: string[] = [];
  const walk = (node: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        continue;
      }

      const account = value as Record<string, unknown>;
      if (account['accountType'] === 'Bank' && !account['isGroup']) {
        names.push(key);
      }

      walk(account);
    }
  };

  walk(eeCOA.tree as Record<string, unknown>);
  return names;
}

export class SetupWizard extends Doc {
  fiscalYearEnd?: Date;
  fiscalYearStart?: Date;

  formulas: FormulaMap = {
    fiscalYearStart: {
      formula: (fieldname?: string) => {
        if (
          fieldname === 'fiscalYearEnd' &&
          this.fiscalYearEnd &&
          !this.fiscalYearStart
        ) {
          return DateTime.fromJSDate(this.fiscalYearEnd)
            .minus({ years: 1 })
            .plus({ days: 1 })
            .toJSDate();
        }

        if (!this.country) {
          return;
        }

        const countryInfo = getCountryInfo();
        const fyStart =
          countryInfo[this.country as string]?.fiscal_year_start ?? '';
        return getFiscalYear(fyStart, true);
      },
      dependsOn: ['country', 'fiscalYearEnd'],
    },
    fiscalYearEnd: {
      formula: (fieldname?: string) => {
        if (
          fieldname === 'fiscalYearStart' &&
          this.fiscalYearStart &&
          !this.fiscalYearEnd
        ) {
          return DateTime.fromJSDate(this.fiscalYearStart)
            .plus({ years: 1 })
            .minus({ days: 1 })
            .toJSDate();
        }

        if (!this.country) {
          return;
        }

        const countryInfo = getCountryInfo();
        const fyEnd =
          countryInfo[this.country as string]?.fiscal_year_end ?? '';
        return getFiscalYear(fyEnd, false);
      },
      dependsOn: ['country', 'fiscalYearStart'],
    },
    currency: {
      formula: () => {
        const country = this.get('country');
        if (typeof country !== 'string') {
          return;
        }

        const countryInfo = getCountryInfo();
        const { code } = countryInfo[country] ?? {};
        if (!code) {
          return;
        }

        const currencyList = getCurrencyList();
        const currency = currencyList.find(
          ({ countryCode }) => countryCode === code
        );

        if (currency === undefined) {
          return currencyList[0].name;
        }

        return currency.name;
      },
      dependsOn: ['country'],
    },
    chartOfAccounts: {
      formula: () => {
        const country = this.get('country') as string | undefined;
        if (country === undefined) {
          return;
        }

        const countryInfo = getCountryInfo();
        const code = countryInfo[country]?.code;
        if (!code) {
          return;
        }
        const coaList = getCOAList();
        const coa = coaList.find(({ countryCode }) => countryCode === code);
        return coa?.name ?? coaList[0].name;
      },
      dependsOn: ['country'],
    },
  };

  validations: ValidationMap = {
    email: validateEmail,
  };

  static lists: ListsMap = {
    country: () => Object.keys(getCountryInfo()),
    currency: () => getCurrencyList().map(({ name }) => name),
    // CUSTOM: dropdown shows the pruned wizard list
    chartOfAccounts: () => getCOAWizardList().map(({ name }) => name),
    // EE: suggest the default bank accounts; free text still allowed
    bankName: (doc) =>
      doc?.get('country') === 'Estonia' ? getEstonianBankAccounts() : [],
  };
}
