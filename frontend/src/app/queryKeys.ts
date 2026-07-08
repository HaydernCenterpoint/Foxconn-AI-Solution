export const queryKeys = {
  dashboard: {
    summary: () => ['dashboard', 'summary'] as const,
  },
  lines: {
    list: () => ['lines', 'list'] as const,
    detail: (lineId: string) => ['lines', 'detail', lineId] as const,
    machines: (lineId: string) => ['lines', 'machines', lineId] as const,
  },
  machines: {
    list: () => ['machines', 'list'] as const,
    detail: (machineId: string) => ['machines', 'detail', machineId] as const,
    hourlyProduction: (machineId: string) => ['machines', 'hourly-production', machineId] as const,
  },
  alarms: {
    list: (status?: string) => ['alarms', 'list', status ?? 'all'] as const,
  },
  admin: {
    users: () => ['users'] as const,
    auditLogs: (limit?: number) => ['audit-logs', limit ?? 100] as const,
    machinesAll: () => ['machines-all'] as const,
  },
  reports: {
    production: (filters: Record<string, string>) => ['reports', 'production', filters] as const,
  },
};
