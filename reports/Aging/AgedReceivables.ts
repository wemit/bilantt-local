import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { AgingReport } from './AgingReport';

export class AgedReceivables extends AgingReport {
  static title = t`Aged Receivables`;
  static reportName = 'AgedReceivables';

  referenceType = ModelNameEnum.SalesInvoice as const;
}
