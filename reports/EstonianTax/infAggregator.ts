import { PurchaseAnnexLine, SaleAnnexLine } from './types';

// KMS § 27 lg 1²: annex declares partners whose invoice total ex VAT reaches €1000 in the period.
export const INF_THRESHOLD = 1000;

export interface InfRatePortion {
  rate: number;

  net: number;
}

export interface InfInvoiceInput {
  invoiceNumber: string;

  invoiceDate: string;

  partyName: string;

  registryCode?: string;

  isCreditNote: boolean;

  netTotal: number;

  grandTotal: number;

  ratePortions: InfRatePortion[];

  hasZeroRated: boolean;

  vatTotal: number;
}

export function buildSaleAnnex(invoices: InfInvoiceInput[]): SaleAnnexLine[] {
  const declarable = invoices.filter(
    (inv) => inv.registryCode && inv.ratePortions.length > 0
  );
  const included = partnersOverThreshold(declarable);

  const lines: SaleAnnexLine[] = [];
  for (const inv of declarable) {
    if (!included.has(inv.registryCode!)) {
      continue;
    }

    for (const portion of inv.ratePortions) {
      lines.push({
        buyerRegCode: inv.registryCode,
        buyerName: inv.partyName,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        invoiceSum: round2(inv.netTotal),
        taxRate: String(portion.rate),
        sumForRateInPeriod: round2(portion.net),
        // Erisus 03: invoice also carries 0%-rated or exempt supply (INF A veerg 10).
        comments: inv.hasZeroRated ? '03' : undefined,
      });
    }
  }

  return lines;
}

export function buildPurchaseAnnex(
  invoices: InfInvoiceInput[]
): PurchaseAnnexLine[] {
  const declarable = invoices.filter(
    (inv) => inv.registryCode && inv.vatTotal !== 0
  );
  const included = partnersOverThreshold(declarable);

  const lines: PurchaseAnnexLine[] = [];
  for (const inv of declarable) {
    if (!included.has(inv.registryCode!)) {
      continue;
    }

    lines.push({
      sellerRegCode: inv.registryCode,
      sellerName: inv.partyName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      invoiceSumVat: round2(inv.grandTotal),
      vatInPeriod: round2(inv.vatTotal),
    });
  }

  return lines;
}

// Regular invoices and credit notes are tallied apart, so credit notes cannot offset the threshold.
function partnersOverThreshold(invoices: InfInvoiceInput[]): Set<string> {
  const regular = new Map<string, number>();
  const credit = new Map<string, number>();

  for (const inv of invoices) {
    const key = inv.registryCode!;
    const tally = inv.isCreditNote ? credit : regular;
    tally.set(key, (tally.get(key) ?? 0) + inv.netTotal);
  }

  const included = new Set<string>();
  for (const [key, sum] of regular) {
    if (round2(sum) >= INF_THRESHOLD) {
      included.add(key);
    }
  }
  for (const [key, sum] of credit) {
    if (round2(Math.abs(sum)) >= INF_THRESHOLD) {
      included.add(key);
    }
  }

  return included;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
