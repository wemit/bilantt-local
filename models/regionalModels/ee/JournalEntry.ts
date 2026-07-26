import { JournalEntry as BaseJournalEntry } from 'models/baseModels/JournalEntry/JournalEntry';
import { assertNotLocked } from './lockDate';

export class JournalEntry extends BaseJournalEntry {
  async validate() {
    await super.validate();
    await assertNotLocked(this);
  }
}
