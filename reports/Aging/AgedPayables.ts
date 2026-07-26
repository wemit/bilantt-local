import { t } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { AgingReport } from './AgingReport';

export class AgedPayables extends AgingReport {
  static title = t`Aged Payables`;
  static reportName = 'AgedPayables';

  referenceType = ModelNameEnum.PurchaseInvoice as const;
}
