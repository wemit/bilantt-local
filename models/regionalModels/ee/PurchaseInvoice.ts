import { PurchaseInvoice as BasePurchaseInvoice } from 'models/baseModels/PurchaseInvoice/PurchaseInvoice';
import { assertNotLocked } from './lockDate';

export class PurchaseInvoice extends BasePurchaseInvoice {
  async validate() {
    await super.validate();
    await assertNotLocked(this);
  }
}
