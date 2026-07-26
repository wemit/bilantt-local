import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import { VatCodeName, VAT_CODES } from 'regional/ee';
import { Report } from 'reports/Report';
import { ColumnField, ReportCell, ReportData, ReportRow } from 'reports/types';
import { Field, SelectOption } from 'schemas/types';
import { VAT_CODE_TO_BUCKET } from './lineMap';
import { KmdBodyTotals } from './types';

export const VD_ONLY_LINE = 'VD only';
export const OFF_KMD_LINE = 'Off KMD';

export const KMD_LINE_LABELS: Partial<Record<keyof KmdBodyTotals, string>> = {
  transactions24: '1',
  transactions20: '1¹',
  transactions22: '1²',
  transactions9: '2',
  transactions5: '2¹',
  transactions13: '2²',
  transactionsZeroVat: '3',
  euAcquisitionsGoodsAndServicesTotal: '6',
  acquisitionOtherGoodsAndServicesTotal: '7',
  supplyExemptFromTax: '8',
  supplySpecialArrangements: '9',
};

const LINE_ORDER: string[] = [
  ...Object.values(KMD_LINE_LABELS),
  VD_ONLY_LINE,
  OFF_KMD_LINE,
];

export interface MonitoringEntry {
  date: string;
  docType: string;
  docName: string;
  party: string;
  vatCode: string;
  net: number;
}

export interface MonitoringRow extends MonitoringEntry {
  kmdLine: string;
  vat: number;
}

export interface LineGroup {
  kmdLine: string;
  rows: MonitoringRow[];
  netTotal: number;
  vatTotal: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function kmdLineFor(vatCode: string): string | null {
  if (!(vatCode in VAT_CODE_TO_BUCKET)) {
    return null;
  }

  const bucket = VAT_CODE_TO_BUCKET[vatCode as VatCodeName];
  if (!bucket) {
    return OFF_KMD_LINE;
  }

  if (!bucket.primary) {
    return VD_ONLY_LINE;
  }

  return KMD_LINE_LABELS[bucket.primary] ?? bucket.primary;
}

export function computeVat(vatCode: string, net: number): number {
  const spec = VAT_CODES[vatCode as VatCodeName];
  if (!spec) {
    return 0;
  }

  return round2((net * spec.rate) / 100);
}

export function buildMonitoringRows(
  entries: MonitoringEntry[]
): MonitoringRow[] {
  const rows: MonitoringRow[] = [];
  for (const entry of entries) {
    const kmdLine = kmdLineFor(entry.vatCode);
    if (!kmdLine) {
      continue;
    }

    rows.push({
      ...entry,
      net: round2(entry.net),
      kmdLine,
      vat: computeVat(entry.vatCode, entry.net),
    });
  }

  return rows;
}

export function groupByKmdLine(
  rows: MonitoringRow[],
  kmdLine?: string
): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  for (const row of rows) {
    if (kmdLine && kmdLine !== 'All' && row.kmdLine !== kmdLine) {
      continue;
    }

    const group = groups.get(row.kmdLine) ?? {
      kmdLine: row.kmdLine,
      rows: [],
      netTotal: 0,
      vatTotal: 0,
    };

    group.rows.push(row);
    group.netTotal = round2(group.netTotal + row.net);
    group.vatTotal = round2(group.vatTotal + row.vat);
    groups.set(row.kmdLine, group);
  }

  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.docName.localeCompare(b.docName)
    );
  }

  return [...groups.values()].sort(
    (a, b) => lineRank(a.kmdLine) - lineRank(b.kmdLine)
  );
}

export function kmdLineOptions(): SelectOption[] {
  const lines = new Set<string>();
  for (const code of Object.keys(VAT_CODE_TO_BUCKET)) {
    const line = kmdLineFor(code);
    if (line) {
      lines.add(line);
    }
  }

  return [...lines]
    .sort((a, b) => lineRank(a) - lineRank(b))
    .map((value) => ({ value, label: value }));
}

function lineRank(line: string): number {
  const index = LINE_ORDER.indexOf(line);
  return index === -1 ? LINE_ORDER.length : index;
}

function num(value: unknown): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export class KmdMonitoringReport extends Report {
  static title = t`KMD Monitoring`;
  static reportName = 'KmdMonitoringReport';
  static description = t`Drill-down behind the KMD declaration: every journal entry and invoice line that feeds a KMD line, grouped with subtotals, so each declared figure can be traced back to its source documents before filing.`;

  year?: number;
  month?: number;
  kmdLine?: string;
  loading = false;

  async setDefaultFilters(): Promise<void> {
    if (!this.year || !this.month) {
      const now = DateTime.local().minus({ months: 1 });
      this.year ??= now.year;
      this.month ??= now.month;
    }

    this.kmdLine ??= 'All';
    return Promise.resolve();
  }

  getFilters(): Field[] {
    return [
      {
        fieldname: 'year',
        label: t`Year`,
        fieldtype: 'Int',
        required: true,
      },
      {
        fieldname: 'month',
        label: t`Month`,
        fieldtype: 'Int',
        required: true,
      },
      {
        fieldname: 'kmdLine',
        label: t`KMD Line`,
        fieldtype: 'Select',
        options: [{ value: 'All', label: t`All` }, ...kmdLineOptions()],
      },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      { fieldname: 'date', label: t`Date`, fieldtype: 'Date', width: 1 },
      { fieldname: 'docType', label: t`Doc Type`, fieldtype: 'Data', width: 1 },
      {
        fieldname: 'docName',
        label: t`Doc Name`,
        fieldtype: 'Data',
        width: 1.5,
      },
      { fieldname: 'party', label: t`Party`, fieldtype: 'Data', width: 1.5 },
      { fieldname: 'vatCode', label: t`VAT Code`, fieldtype: 'Data', width: 1 },
      { fieldname: 'kmdLine', label: t`KMD Line`, fieldtype: 'Data', width: 1 },
      {
        fieldname: 'net',
        label: t`Net (EUR)`,
        fieldtype: 'Currency',
        width: 1,
      },
      {
        fieldname: 'vat',
        label: t`VAT (EUR)`,
        fieldtype: 'Currency',
        width: 1,
      },
    ] as ColumnField[];
  }

  getActions(): Action[] {
    // commonExporter pulls Vue UI modules; deferred so tape can import this file
    return (['CSV', 'JSON'] as const).map((label) => ({
      group: t`Export`,
      label,
      type: 'primary',
      action: async () => {
        const { default: getCommonExportActions } = await import(
          'reports/commonExporter'
        );
        const match = getCommonExportActions(this).find(
          (a) => a.label === label
        );
        if (match) {
          await (match.action as () => Promise<void>)();
        }
      },
    }));
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    try {
      const entries = [
        ...(await this.fetchJournalEntrySources()),
        ...(await this.fetchInvoiceSources(ModelNameEnum.SalesInvoice)),
        ...(await this.fetchInvoiceSources(ModelNameEnum.PurchaseInvoice)),
      ];

      const rows = buildMonitoringRows(entries);
      const groups = groupByKmdLine(rows, this.kmdLine);
      this.reportData = this.toReportRows(groups);
    } finally {
      this.loading = false;
    }
  }

  private period(): { from: string; to: string } {
    const from = DateTime.fromObject({
      year: this.year!,
      month: this.month!,
      day: 1,
    });
    return { from: from.toISODate()!, to: from.endOf('month').toISODate()! };
  }

  private async fetchJournalEntrySources(): Promise<MonitoringEntry[]> {
    const { from, to } = this.period();

    const liquidAccounts = (await this.fyo.db.getAllRaw('Account', {
      fields: ['name'],
      filters: { accountType: ['in', ['Bank', 'Cash']] },
    })) as Array<{ name: string }>;
    const liquidAccountNames = new Set(liquidAccounts.map((a) => a.name));

    const jeRows = (await this.fyo.db.getAllRaw(ModelNameEnum.JournalEntry, {
      fields: ['name', 'date', 'vatCode', 'archivalId', 'counterparty'],
      filters: {
        submitted: true,
        cancelled: false,
        date: ['>=', from, '<=', to],
      },
    })) as Array<{
      name: string;
      date?: string;
      vatCode?: string;
      archivalId?: string;
      counterparty?: string;
    }>;

    const entries: MonitoringEntry[] = [];
    for (const je of jeRows) {
      const vatCode = je.vatCode ?? '';
      if (!(vatCode in VAT_CODE_TO_BUCKET)) {
        continue;
      }

      // -RC JEs carry only self-assessed VAT; net base sits on the source doc
      if ((je.archivalId ?? '').endsWith('-RC')) {
        continue;
      }

      const accountRows = (await this.fyo.db.getAllRaw(
        ModelNameEnum.JournalEntryAccount,
        {
          fields: ['account', 'debit', 'credit'],
          filters: { parent: je.name },
        }
      )) as Array<{ account: string; debit?: string; credit?: string }>;

      let net = 0;
      for (const row of accountRows) {
        if (liquidAccountNames.has(row.account)) {
          continue;
        }

        net += num(row.debit) + num(row.credit);
      }

      net = round2(net);
      if (net === 0) {
        continue;
      }

      entries.push({
        date: String(je.date ?? '').slice(0, 10),
        docType: t`Journal Entry`,
        docName: je.name,
        party: je.counterparty ?? '',
        vatCode,
        net,
      });
    }

    return entries;
  }

  private async fetchInvoiceSources(
    schemaName: ModelNameEnum.SalesInvoice | ModelNameEnum.PurchaseInvoice
  ): Promise<MonitoringEntry[]> {
    const { from, to } = this.period();
    const isSales = schemaName === ModelNameEnum.SalesInvoice;
    const itemSchema = isSales
      ? ModelNameEnum.SalesInvoiceItem
      : ModelNameEnum.PurchaseInvoiceItem;
    const docType = isSales ? t`Sales Invoice` : t`Purchase Invoice`;

    const invoices = (await this.fyo.db.getAllRaw(schemaName, {
      fields: ['name', 'date', 'party', 'exchangeRate'],
      filters: {
        submitted: true,
        cancelled: false,
        date: ['>=', from, '<=', to],
      },
    })) as Array<{
      name: string;
      date?: string;
      party?: string;
      exchangeRate?: string | number;
    }>;

    const entries: MonitoringEntry[] = [];
    for (const invoice of invoices) {
      const items = (await this.fyo.db.getAllRaw(itemSchema, {
        fields: ['tax', 'amount'],
        filters: { parent: invoice.name },
      })) as Array<{ tax?: string; amount?: string | number }>;

      const exchangeRate = num(invoice.exchangeRate) || 1;
      const netByCode = new Map<string, number>();
      for (const item of items) {
        const tax = item.tax ?? '';
        if (!(tax in VAT_CODE_TO_BUCKET)) {
          continue;
        }

        netByCode.set(
          tax,
          (netByCode.get(tax) ?? 0) + num(item.amount) * exchangeRate
        );
      }

      for (const [vatCode, net] of netByCode) {
        entries.push({
          date: String(invoice.date ?? '').slice(0, 10),
          docType,
          docName: invoice.name,
          party: invoice.party ?? '',
          vatCode,
          net: round2(net),
        });
      }
    }

    return entries;
  }

  private toReportRows(groups: LineGroup[]): ReportData {
    const reportRows: ReportRow[] = [];
    for (const group of groups) {
      for (const row of group.rows) {
        reportRows.push({
          cells: [
            this.textCell(
              row.date ? this.fyo.format(new Date(row.date), 'Date') : '',
              1,
              row.date
            ),
            this.textCell(row.docType, 1),
            this.textCell(row.docName, 1.5),
            this.textCell(row.party, 1.5),
            this.textCell(row.vatCode, 1),
            this.textCell(row.kmdLine, 1),
            this.moneyCell(row.net),
            this.moneyCell(row.vat),
          ],
        });
      }

      reportRows.push({
        cells: [
          this.textCell('', 1),
          this.textCell(t`Subtotal`, 1, undefined, true),
          this.textCell('', 1.5),
          this.textCell('', 1.5),
          this.textCell('', 1),
          this.textCell(group.kmdLine, 1, undefined, true),
          this.moneyCell(group.netTotal, true),
          this.moneyCell(group.vatTotal, true),
        ],
      });
    }

    return reportRows;
  }

  private textCell(
    value: string,
    width: number,
    rawValue?: string,
    bold?: boolean
  ): ReportCell {
    return { value, rawValue: rawValue ?? value, width, align: 'left', bold };
  }

  private moneyCell(value: number, bold?: boolean): ReportCell {
    return {
      value: this.fyo.format(value, 'Currency'),
      rawValue: value,
      width: 1,
      align: 'right',
      bold,
    };
  }
}
