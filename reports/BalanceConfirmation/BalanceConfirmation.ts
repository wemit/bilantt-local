import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ColumnField, ReportRow } from 'reports/types';
import { Field } from 'schemas/types';
import { getPathAndMakePDF } from 'src/utils/printTemplates';
import { paperSizeMap } from 'src/utils/ui';
import { QueryFilter } from 'utils/db/types';
import {
  BalanceAccountType,
  BalanceLetter,
  foldPartyBalances,
  getConfirmationDocumentHtml,
  round2,
  toNumber,
} from './letterHtml';

type RoleFilter = 'All' | 'Customer' | 'Supplier';

interface PartyBalanceRow {
  party: string;
  role: string;
  registryCode: string;
  receivable: number;
  payable: number;
}

interface OpenInvoice {
  name: string;
  date: string;
  grandTotal: number;
  outstanding: number;
}

export class BalanceConfirmation extends Report {
  static title = t`Balance Confirmations`;
  static reportName = 'BalanceConfirmation';
  static description = t`Balance confirmation (saldokinnitus): receivable and payable balances per partner at a chosen date, used for the year-end inventory of balances. Export prints one confirmation letter per partner as a single PDF to send out for sign-off.`;
  static isInventory = false;

  loading = false;

  asOfDate?: string;
  role?: RoleFilter;
  party?: string;

  partyRows: PartyBalanceRow[] = [];

  setDefaultFilters(): void {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
    }

    if (!this.role) {
      this.role = 'All';
    }
  }

  getFilters(): Field[] {
    return [
      {
        fieldtype: 'Date',
        label: t`As of Date`,
        placeholder: t`As of Date`,
        fieldname: 'asOfDate',
        required: true,
      },
      {
        fieldtype: 'Select',
        label: t`Role`,
        fieldname: 'role',
        options: [
          { label: t`All`, value: 'All' },
          { label: t`Customer`, value: 'Customer' },
          { label: t`Supplier`, value: 'Supplier' },
        ],
      },
      {
        fieldtype: 'Link',
        target: 'Party',
        label: t`Party`,
        placeholder: t`Party`,
        fieldname: 'party',
      },
    ] as Field[];
  }

  getColumns(): ColumnField[] {
    return [
      {
        fieldname: 'party',
        label: t`Party`,
        fieldtype: 'Link',
        width: 2,
      },
      {
        fieldname: 'role',
        label: t`Role`,
        fieldtype: 'Data',
      },
      {
        fieldname: 'receivable',
        label: t`They Owe Us`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1.25,
      },
      {
        fieldname: 'payable',
        label: t`We Owe Them`,
        fieldtype: 'Currency',
        align: 'right',
        width: 1.25,
      },
    ] as ColumnField[];
  }

  getActions(): Action[] {
    return [
      ...getCommonExportActions(this),
      {
        group: t`Export`,
        label: t`Confirmation Letters PDF`,
        type: 'secondary',
        action: async () => {
          await this.exportConfirmationLetters();
        },
      },
    ];
  }

  async setReportData(): Promise<void> {
    this.loading = true;
    try {
      this.partyRows = await this.getPartyRows();
      this.reportData = this.partyRows.map((row) => this.toReportRow(row));
    } finally {
      this.loading = false;
    }
  }

  // Datetime strings: exclusive next-day bound keeps the whole as-of day
  private get endDateExclusive(): string {
    return DateTime.fromISO(this.asOfDate!).plus({ days: 1 }).toISODate()!;
  }

  private async getPartyRows(): Promise<PartyBalanceRow[]> {
    const accounts = (await this.fyo.db.getAllRaw(ModelNameEnum.Account, {
      fields: ['name', 'accountType'],
      filters: { accountType: ['in', ['Receivable', 'Payable']] },
    })) as Array<{ name: string; accountType: BalanceAccountType }>;

    if (!accounts.length) {
      return [];
    }

    const accountTypes: Record<string, BalanceAccountType> = {};
    for (const account of accounts) {
      accountTypes[account.name] = account.accountType;
    }

    const ledgerFilters: QueryFilter = {
      account: ['in', accounts.map((a) => a.name)],
      date: ['<', this.endDateExclusive],
      reverted: false,
    };
    if (this.party) {
      ledgerFilters.party = this.party;
    }

    const entries = (await this.fyo.db.getAllRaw(
      ModelNameEnum.AccountingLedgerEntry,
      {
        fields: ['party', 'account', 'debit', 'credit'],
        filters: ledgerFilters,
      }
    )) as Array<{
      party: string | null;
      account: string;
      debit: string | null;
      credit: string | null;
    }>;

    const balances = foldPartyBalances(entries, accountTypes);
    if (!balances.size) {
      return [];
    }

    const partyFields = ['name', 'role'];
    if (this.hasPartyRegistryCode) {
      partyFields.push('registryCode');
    }

    const parties = (await this.fyo.db.getAllRaw(ModelNameEnum.Party, {
      fields: partyFields,
    })) as Array<{
      name: string;
      role: string | null;
      registryCode?: string | null;
    }>;
    const partyMeta = new Map(parties.map((p) => [p.name, p]));

    const rows: PartyBalanceRow[] = [];
    for (const [party, balance] of balances) {
      const meta = partyMeta.get(party);
      const role = meta?.role ?? '';
      if (
        this.role &&
        this.role !== 'All' &&
        role !== this.role &&
        role !== 'Both'
      ) {
        continue;
      }

      rows.push({
        party,
        role,
        registryCode: meta?.registryCode ?? '',
        receivable: balance.receivable,
        payable: round2(-balance.payable),
      });
    }

    return rows.sort((a, b) => a.party.localeCompare(b.party));
  }

  // registryCode ships with the EE regional Party schema; guard non-EE books
  private get hasPartyRegistryCode(): boolean {
    const fields = this.fyo.schemaMap[ModelNameEnum.Party]?.fields ?? [];
    return fields.some((f) => f.fieldname === 'registryCode');
  }

  private async getOpenInvoices(): Promise<Map<string, OpenInvoice[]>> {
    const invoiceMap = new Map<string, OpenInvoice[]>();
    const schemaNames = [
      ModelNameEnum.SalesInvoice,
      ModelNameEnum.PurchaseInvoice,
    ];

    for (const schemaName of schemaNames) {
      const filters: QueryFilter = {
        submitted: true,
        cancelled: false,
        date: ['<', this.endDateExclusive],
      };
      if (this.party) {
        filters.party = this.party;
      }

      const rows = (await this.fyo.db.getAllRaw(schemaName, {
        fields: ['name', 'date', 'party', 'grandTotal', 'outstandingAmount'],
        filters,
      })) as Array<{
        name: string;
        date: string;
        party: string;
        grandTotal: string | null;
        outstandingAmount: string | null;
      }>;

      for (const row of rows) {
        const outstanding = toNumber(row.outstandingAmount);
        if (outstanding <= 0) {
          continue;
        }

        const list = invoiceMap.get(row.party) ?? [];
        list.push({
          name: row.name,
          date: row.date,
          grandTotal: toNumber(row.grandTotal),
          outstanding,
        });
        invoiceMap.set(row.party, list);
      }
    }

    for (const list of invoiceMap.values()) {
      list.sort((a, b) => a.date.localeCompare(b.date));
    }

    return invoiceMap;
  }

  private async exportConfirmationLetters(): Promise<void> {
    if (!this.partyRows.length) {
      await this.setReportData();
    }

    if (!this.partyRows.length) {
      throw new Error(
        t`No outstanding party balances found for the selected filters.`
      );
    }

    const settings = this.fyo.singles.AccountingSettings;
    const companyName = (settings?.companyName as string) ?? '';
    const companyRegistryCode = (settings?.registryCode as string) ?? '';
    const companyVatNumber = (settings?.vatNumber as string) ?? '';
    const currency =
      (this.fyo.singles.SystemSettings?.currency as string) ?? '';
    const asOfDate = this.fyo.format(new Date(this.asOfDate!), 'Date');

    const invoiceMap = await this.getOpenInvoices();
    const letters: BalanceLetter[] = this.partyRows.map((row) => {
      const net = round2(row.receivable - row.payable);
      return {
        companyName,
        companyRegistryCode,
        companyVatNumber,
        partyName: row.party,
        partyRegistryCode: row.registryCode,
        asOfDate,
        balance: `${this.fyo.format(
          Math.abs(net),
          'Currency'
        )} ${currency}`.trim(),
        weOwe: net < 0,
        invoices: (invoiceMap.get(row.party) ?? []).map((inv) => ({
          name: inv.name,
          date: this.fyo.format(new Date(inv.date), 'Date'),
          grandTotal: this.fyo.format(inv.grandTotal, 'Currency'),
          outstanding: this.fyo.format(inv.outstanding, 'Currency'),
        })),
      };
    });

    const innerHTML = getConfirmationDocumentHtml(letters);
    const { width, height } = paperSizeMap.A4;
    await getPathAndMakePDF(
      `BalanceConfirmation-${this.asOfDate!}`,
      innerHTML,
      width,
      height
    );
  }

  private toReportRow(row: PartyBalanceRow): ReportRow {
    return {
      cells: [
        { rawValue: row.party, value: row.party, width: 2, align: 'left' },
        { rawValue: row.role, value: row.role, width: 1, align: 'left' },
        {
          rawValue: row.receivable,
          value: this.fyo.format(row.receivable, 'Currency'),
          width: 1.25,
          align: 'right',
        },
        {
          rawValue: row.payable,
          value: this.fyo.format(row.payable, 'Currency'),
          width: 1.25,
          align: 'right',
        },
      ],
    };
  }
}
