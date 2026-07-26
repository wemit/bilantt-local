// CUSTOM: aging addon manifest — aged receivables/payables reports
import { AgedPayables } from 'reports/Aging/AgedPayables';
import { AgedReceivables } from 'reports/Aging/AgedReceivables';
import type { AppAddon } from '../types';

const aging: AppAddon = {
  name: 'aging',
  reports: { AgedReceivables, AgedPayables },
};

export default aging;
