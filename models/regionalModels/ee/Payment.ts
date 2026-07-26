import { Payment as BasePayment } from 'models/baseModels/Payment/Payment';
import { assertNotLocked } from './lockDate';

export class Payment extends BasePayment {
  async validate() {
    await super.validate();
    await assertNotLocked(this);
  }
}
