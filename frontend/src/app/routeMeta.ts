import type { RefreshScope } from './refresh';

export interface RouteMeta {
  titleKey: string;
  refreshScope: RefreshScope;
  requiresAuth?: boolean;
}

export const routeMetaByPath: Record<string, RouteMeta> = {
  // Viewer routes (public)
  '/': { titleKey: 'titles.overview', refreshScope: 'monitoring' },
  '/lines': { titleKey: 'titles.lines', refreshScope: 'monitoring' },
  '/machines': { titleKey: 'titles.machines', refreshScope: 'monitoring' },
  '/alarms': { titleKey: 'titles.alarms', refreshScope: 'monitoring' },
  '/settings': { titleKey: 'titles.settings', refreshScope: 'all' },

  // Authenticated admin routes
  '/admin': { titleKey: 'titles.overview', refreshScope: 'monitoring', requiresAuth: true },
  '/admin/lines': { titleKey: 'titles.lines', refreshScope: 'monitoring', requiresAuth: true },
  '/admin/machines': { titleKey: 'titles.machines', refreshScope: 'monitoring', requiresAuth: true },
  '/admin/alarms': { titleKey: 'titles.alarms', refreshScope: 'monitoring', requiresAuth: true },
  '/admin/users': { titleKey: 'titles.users', refreshScope: 'all', requiresAuth: true },
  '/admin/audit-logs': { titleKey: 'titles.auditLogs', refreshScope: 'all', requiresAuth: true },
  '/admin/settings': { titleKey: 'titles.settings', refreshScope: 'all', requiresAuth: true },

  '/login': { titleKey: 'titles.login', refreshScope: 'all' },
  '/403': { titleKey: 'titles.forbidden', refreshScope: 'all' },
  '/404': { titleKey: 'titles.notFound', refreshScope: 'all' },
};
