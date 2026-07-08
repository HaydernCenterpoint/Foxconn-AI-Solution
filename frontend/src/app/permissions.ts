import type { UserRole } from '../shared/types/domain';

export type Permission =
  | 'dashboard.view'
  | 'lines.view'
  | 'lines.configure'
  | 'machines.view'
  | 'machines.configure'
  | 'alarms.view'
  | 'alarms.mutate'
  | 'reports.view'
  | 'users.manage'
  | 'auditLogs.view';

const permissionsByRole: Record<UserRole, readonly Permission[]> = {
  ADMIN: [
    'dashboard.view', 'lines.view', 'lines.configure', 'machines.view', 'machines.configure',
    'alarms.view', 'alarms.mutate', 'reports.view', 'users.manage', 'auditLogs.view',
  ],
  ENGINEER: [
    'dashboard.view', 'lines.view', 'lines.configure', 'machines.view', 'machines.configure',
    'alarms.view', 'alarms.mutate', 'reports.view',
  ],
  GUEST: ['dashboard.view', 'lines.view', 'machines.view', 'alarms.view', 'reports.view'],
};

export function hasPermission(role: UserRole | null, permission: Permission) {
  return !!role && permissionsByRole[role].includes(permission);
}
