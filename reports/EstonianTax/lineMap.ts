import { VatCodeName } from 'regional/ee';
import { KmdBodyTotals } from './types';

export type KmdSide = 'sales' | 'purchase' | 'rc-sales' | 'rc-purchase';

export type VdColumn = 'goods' | 'services' | 'triangle';

export interface VatCodeBucket {
  primary?: keyof KmdBodyTotals;

  also?: (keyof KmdBodyTotals)[];
  side: KmdSide;

  rate: number;

  vdColumn?: VdColumn;
}

export const VAT_CODE_TO_BUCKET: Record<VatCodeName, VatCodeBucket | null> = {
  EE24: { primary: 'transactions24', side: 'sales', rate: 24 },
  EE13: { primary: 'transactions13', side: 'sales', rate: 13 },
  EE9: { primary: 'transactions9', side: 'sales', rate: 9 },
  EE0: { primary: 'transactionsZeroVat', side: 'sales', rate: 0 },
  ZERO_EU_B2B: {
    primary: 'transactionsZeroVat',
    also: ['euSupplyInclGoodsAndServicesZeroVat', 'euSupplyGoodsZeroVat'],
    side: 'sales',
    rate: 0,
    vdColumn: 'goods',
  },
  ZERO_EU_GOODS: {
    primary: 'transactionsZeroVat',
    also: ['euSupplyInclGoodsAndServicesZeroVat', 'euSupplyGoodsZeroVat'],
    side: 'sales',
    rate: 0,
    vdColumn: 'goods',
  },
  ZERO_EU_SERVICES: {
    primary: 'transactionsZeroVat',
    also: ['euSupplyInclGoodsAndServicesZeroVat'],
    side: 'sales',
    rate: 0,
    vdColumn: 'services',
  },
  ZERO_EU_TRIANGLE: {
    side: 'sales',
    rate: 0,
    vdColumn: 'triangle',
  },
  ZERO_EXPORT: {
    primary: 'transactionsZeroVat',
    also: ['exportZeroVat'],
    side: 'sales',
    rate: 0,
  },
  // KMS § 3 lg 4: RC acquisitions are taxable value on line 1; e-MTA derives line 4 from it.
  EU_RC_GOODS: {
    primary: 'euAcquisitionsGoodsAndServicesTotal',
    also: ['euAcquisitionsGoods', 'transactions24'],
    side: 'rc-purchase',
    rate: 24,
  },
  EU_RC_SERVICES: {
    primary: 'euAcquisitionsGoodsAndServicesTotal',
    also: ['transactions24'],
    side: 'rc-purchase',
    rate: 24,
  },
  NON_EU_RC: {
    primary: 'acquisitionOtherGoodsAndServicesTotal',
    also: ['transactions24'],
    side: 'rc-purchase',
    rate: 24,
  },
  EXEMPT: { primary: 'supplyExemptFromTax', side: 'sales', rate: 0 },
  // Margin scheme (KMS §41/§42): margin reported on the matching rate's line.
  MARGIN_24: { primary: 'transactions24', side: 'sales', rate: 24 },
  MARGIN_22: { primary: 'transactions22', side: 'sales', rate: 22 },
  MARGIN_9: { primary: 'transactions9', side: 'sales', rate: 9 },
  MARGIN_5: { primary: 'transactions5', side: 'sales', rate: 5 },
  // Off-KMD: OSS (§43) goes on the OSS return; EU establishment taxed abroad.
  OSS_SALES: null,
  EU_FIXED_ESTAB: null,
};

export interface JeAccountRow {
  account: string;
  debit?: string;
  credit?: string;
}

// KMS § 4: lines 1-3 and 8 hold own supply only; an expense row under a sales code is none.
export function jeNet(
  rows: JeAccountRow[],
  side: KmdSide,
  liquidAccounts: Set<string>,
  incomeAccounts: Set<string>
): number {
  const isSales = side === 'sales' || side === 'rc-sales';
  let net = 0;
  for (const r of rows) {
    if (liquidAccounts.has(r.account)) continue;
    if (incomeAccounts.has(r.account) !== isSales) continue;
    const delta = (Number(r.debit) || 0) - (Number(r.credit) || 0);
    net += isSales ? -delta : delta;
  }
  return Math.round(net * 100) / 100;
}

export function emptyKmdBody(): KmdBodyTotals {
  return {
    transactions24: 0,
    transactions20: 0,
    transactions22: 0,
    transactions9: 0,
    transactions5: 0,
    transactions13: 0,
    transactionsZeroVat: 0,
    euSupplyInclGoodsAndServicesZeroVat: 0,
    euSupplyGoodsZeroVat: 0,
    exportZeroVat: 0,
    salePassengersWithReturnVat: 0,
    inputVatTotal: 0,
    importVat: 0,
    fixedAssetsVat: 0,
    carsVat: 0,
    numberOfCars: 0,
    carsPartialVat: 0,
    numberOfCarsPartial: 0,
    euAcquisitionsGoodsAndServicesTotal: 0,
    euAcquisitionsGoods: 0,
    acquisitionOtherGoodsAndServicesTotal: 0,
    acquisitionImmovablesAndScrapMetalAndGold: 0,
    supplyExemptFromTax: 0,
    supplySpecialArrangements: 0,
    adjustmentsPlus: 0,
    adjustmentsMinus: 0,
  };
}

export function pickVersion(year: number, month: number): string {
  const ym = year * 100 + month;
  if (ym >= 202507) return 'KMD6';
  if (ym >= 202501) return 'KMD5';
  if (ym >= 202401) return 'KMD4';
  return 'KMD4';
}
