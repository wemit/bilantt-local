import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { DateTime } from 'luxon';
import { ModelNameEnum } from 'models/types';
import getCommonExportActions from 'reports/commonExporter';
import { Report } from 'reports/Report';
import { ColumnField, ReportData, ReportRow } from 'reports/types';
import { Field, RawValue } from 'schemas/types';
import { QueryFilter } from 'utils/db/types';
import {
  AGING_BUCKET_LABELS,
  AgingPartyGroup,
  AgingTotals,
  buildAgingGroups,
  RawAgingInvoice,
} from './helpers';

interface RowCell {
  value: string;
  rawValue: RawValue | undefined;
  align?: 'left' | 'right';
}

export abstract class AgingReport extends Report {
  abstract referenceType:
    | ModelNameEnum.SalesInvoice
    | ModelNameEnum.PurchaseInvoice;

  asOfDate?: string;
  party?: string;
  loading = false;

  setDefaultFilters() {
    if (!this.asOfDate) {
      this.asOfDate = DateTime.now().toISODate();
    }
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
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
        fieldtype: 'Link',
        target: 'Party',
        label: t`Party`,
        placeholder: t`Party`,
        fieldname: 'party',
      },
    ] as Field[];
  }

  getColumns(): ColumnField[] {
    const bucketColumns = AGING_BUCKET_LABELS.map((label, i) => ({
      label,
      fieldtype: 'Currency',
      fieldname: `bucket${i}`,
      align: 'right',
    }));

    return [
      {
        label: t`Party`,
        fieldtype: 'Data',
        fieldname: 'party',
        width: 1.5,
      },
      {
        label: t`Invoice`,
        fieldtype: 'Link',
        fieldname: 'invoice',
        width: 1.25,
      },
      {
        label: t`Date`,
        fieldtype: 'Date',
        fieldname: 'date',
      },
      {
        label: t`Age (Days)`,
        fieldtype: 'Int',
        fieldname: 'ageDays',
        align: 'right',
        width: 0.75,
      },
      {
        label: t`Outstanding`,
        fieldtype: 'Currency',
        fieldname: 'outstanding',
        align: 'right',
        width: 1.25,
      },
      ...bucketColumns,
    ] as ColumnField[];
  }

  async setReportData() {
    this.loading = true;
    try {
      const filters: QueryFilter = { submitted: true, cancelled: false };
      if (this.party) {
        filters.party = this.party;
      }

      const rawInvoices = (await this.fyo.db.getAllRaw(this.referenceType, {
        fields: ['name', 'party', 'date', 'outstandingAmount'],
        filters,
      })) as unknown as RawAgingInvoice[];

      const { groups, grandTotal } = buildAgingGroups(
        rawInvoices,
        this.asOfDate!
      );
      this.reportData = this.getReportRows(groups, grandTotal);
    } finally {
      this.loading = false;
    }
  }

  private getReportRows(
    groups: AgingPartyGroup[],
    grandTotal: AgingTotals
  ): ReportData {
    const rows: ReportData = [];
    for (const group of groups) {
      for (const entry of group.entries) {
        rows.push(
          this.buildRow([
            { value: entry.party, rawValue: entry.party },
            { value: entry.invoice, rawValue: entry.invoice },
            {
              value: this.fyo.format(new Date(entry.date), 'Date'),
              rawValue: entry.date,
            },
            {
              value: String(entry.ageDays),
              rawValue: entry.ageDays,
              align: 'right',
            },
            this.moneyCell(entry.outstanding),
            ...entry.buckets.map((b) => this.moneyCell(b, true)),
          ])
        );
      }

      rows.push(this.getTotalRow(t`Total`, group.total, { italics: true }));
      rows.push(this.getEmptyRow());
    }

    rows.push(this.getTotalRow(t`Grand Total`, grandTotal, { bold: true }));
    return rows;
  }

  private getTotalRow(
    label: string,
    totals: AgingTotals,
    style: { bold?: boolean; italics?: boolean }
  ): ReportRow {
    const row = this.buildRow([
      { value: label, rawValue: label },
      { value: '', rawValue: '' },
      { value: '', rawValue: '' },
      { value: '', rawValue: '' },
      this.moneyCell(totals.outstanding),
      ...totals.buckets.map((b) => this.moneyCell(b)),
    ]);
    for (const cell of row.cells) {
      cell.bold = style.bold;
      cell.italics = style.italics;
    }

    return row;
  }

  private getEmptyRow(): ReportRow {
    return {
      isEmpty: true,
      cells: this.columns.map((c) => ({
        value: '',
        rawValue: '',
        width: c.width ?? 1,
      })),
    };
  }

  private moneyCell(value: number, blankZero = false): RowCell {
    return {
      value: blankZero && value === 0 ? '' : this.fyo.format(value, 'Currency'),
      rawValue: value,
      align: 'right',
    };
  }

  private buildRow(cells: RowCell[]): ReportRow {
    return {
      cells: cells.map((cell, i) => ({
        ...cell,
        width: this.columns[i]?.width ?? 1,
      })),
    };
  }
}
