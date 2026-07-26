// CUSTOM: Estonia addon manifest — renderer half (main-process half in main/addons/)
import { t } from 'fyo';
import type { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';
import { AnnualReport } from 'reports/EstonianAnnualReport/AnnualReport';
import { BalanceConfirmation } from 'reports/BalanceConfirmation/BalanceConfirmation';
import { KmdReport } from 'reports/EstonianTax/KmdReport';
import { KmdMonitoringReport } from 'reports/EstonianTax/MonitoringReport';
import { showDialog, showToast } from 'src/utils/interactive';
import type { SidebarRoot } from 'src/utils/types';
import type { AppAddon } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getEstoniaSidebar(_fyo: Fyo): SidebarRoot[] {
  // EE: no VAT-number gate — un-registered EE company still needs the sidebar
  return [
    {
      label: t`Estonia`,
      name: 'estonia',
      icon: 'common-entries',
      route: '/regional/ee/bank-import',
      items: [
        {
          label: t`Bank Import`,
          name: 'bank-import',
          route: '/regional/ee/bank-import',
        },
        { label: t`KMD`, name: 'kmd', route: '/report/KmdReport' },
        {
          label: t`KMD Monitoring`,
          name: 'kmd-monitoring',
          route: '/report/KmdMonitoringReport',
        },
        {
          label: t`Annual Report`,
          name: 'annual-report',
          route: '/report/AnnualReport',
        },
        {
          label: t`Balance Confirmations`,
          name: 'balance-confirmations',
          route: '/report/BalanceConfirmation',
        },
      ],
    },
  ];
}

async function submitDrafts(fyo: Fyo) {
  const drafts = (await fyo.db.getAllRaw(ModelNameEnum.JournalEntry, {
    fields: ['name'],
    filters: { submitted: false, cancelled: false },
  })) as { name: string }[];

  if (drafts.length === 0) {
    showToast({ type: 'info', message: t`No draft journal entries.` });
    return;
  }

  await showDialog({
    title: t`Submit ${drafts.length} draft journal entries?`,
    type: 'warning',
    detail: t`This posts them to the ledger. Each can still be cancelled individually afterwards.`,
    buttons: [
      {
        label: t`Submit`,
        isPrimary: true,
        action: async () => {
          await runSubmitDrafts(fyo, drafts);
          return true;
        },
      },
      { label: t`Cancel`, action: () => null, isEscape: true },
    ],
  });
}

async function runSubmitDrafts(fyo: Fyo, drafts: { name: string }[]) {
  let submitted = 0;
  let failed = 0;
  for (const { name } of drafts) {
    try {
      const doc = await fyo.doc.getDoc(ModelNameEnum.JournalEntry, name);
      if (!doc.submitted && !doc.cancelled) {
        await doc.submit();
        submitted += 1;
      }
    } catch {
      failed += 1;
    }
  }

  showToast({
    type: failed ? 'error' : 'success',
    message: failed
      ? t`Submitted ${submitted}, ${failed} failed.`
      : t`Submitted ${submitted} journal entries.`,
  });
}

const ee: AppAddon = {
  name: 'ee',
  condition: (fyo) => fyo.singles?.SystemSettings?.countryCode === 'ee',
  reports: {
    KmdReport,
    KmdMonitoringReport,
    AnnualReport,
    BalanceConfirmation,
  },
  routes: [
    {
      path: '/regional/ee/bank-import',
      name: 'EE Bank Import',
      // CUSTOM: lazy — eager import cycles back through reports/index
      component: () => import('src/pages/BankImport/BankImportPage.vue'),
    },
  ],
  sidebar: getEstoniaSidebar,
  listActions: {
    [ModelNameEnum.JournalEntry]: [
      { label: t`Submit Drafts`, action: submitDrafts },
    ],
  },
};

export default ee;
