import { SalesInvoice as BaseSalesInvoice } from 'models/baseModels/SalesInvoice/SalesInvoice';
import { assertNotLocked } from './lockDate';

export class SalesInvoice extends BaseSalesInvoice {
  async validate() {
    await super.validate();
    await assertNotLocked(this);
  }
}
