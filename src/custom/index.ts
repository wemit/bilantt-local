// CUSTOM: addon aggregator — addons register here once; core registries
// spread the merged getters in
import type { Fyo } from 'fyo';
import type { RouteRecordRaw } from 'vue-router';
import type { SidebarRoot } from 'src/utils/types';
import type { AddonListAction, AppAddon, ReportClass } from './types';
import aging from './aging';
import ee from './ee';

export const addons: AppAddon[] = [ee, aging];

function enabled(fyo: Fyo): AppAddon[] {
  return addons.filter((a) => !a.condition || a.condition(fyo));
}

export function getAddonReports(): Record<string, ReportClass> {
  return addons.reduce<Record<string, ReportClass>>((acc, a) => {
    return Object.assign(acc, a.reports);
  }, {});
}

export function getAddonRoutes(): RouteRecordRaw[] {
  return addons.flatMap((a) => a.routes ?? []);
}

export function getAddonSidebar(fyo: Fyo): SidebarRoot[] {
  return enabled(fyo).flatMap((a) => a.sidebar?.(fyo) ?? []);
}

export function getAddonListActions(
  schemaName: string,
  fyo: Fyo
): AddonListAction[] {
  return enabled(fyo).flatMap((a) => a.listActions?.[schemaName] ?? []);
}

// CUSTOM: reports/routes register at module load, before fyo singles exist —
// visibility surfaces filter with this instead of the addon condition
export function getDisabledAddonReportNames(fyo: Fyo): string[] {
  return addons
    .filter((a) => a.condition && !a.condition(fyo))
    .flatMap((a) => Object.keys(a.reports ?? {}));
}
