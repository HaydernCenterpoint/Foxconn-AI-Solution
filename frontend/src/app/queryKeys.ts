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
  assets: {
    tree: () => ['assets', 'tree'] as const,
    documents: (assetId: string) => ['assets', 'documents', assetId] as const,
    machine: (assetId: string) => ['assets', 'machine', assetId] as const,
    alarms: (assetId: string) => ['assets', 'alarms', assetId] as const,
  },
  alerts: {
    all: ['alerts', 'list'] as const,
    detail: (alertId: string) => ['alerts', 'detail', alertId] as const,
    stats: () => ['alerts', 'stats'] as const,
  },
  health: {
    score: (assetId: string) => ['health', 'score', assetId] as const,
    history: (assetId: string) => ['health', 'history', assetId] as const,
  },
  predictions: {
    risk: (assetId: string) => ['predictions', 'risk', assetId] as const,
    anomaly: (assetId: string) => ['predictions', 'anomaly', assetId] as const,
  },
  predictiveAlerts: {
    list: (status?: string, severity?: string) =>
      ['predictive-alerts', 'list', status ?? 'all', severity ?? 'all'] as const,
    detail: (alertId: string) => ['predictive-alerts', 'detail', alertId] as const,
    rca: (alertId: string) => ['predictive-alerts', 'rca', alertId] as const,
    stats: () => ['predictive-alerts', 'stats'] as const,
    health: (assetId: string) => ['predictive-alerts', 'health', assetId] as const,
    healthHistory: (assetId: string) => ['predictive-alerts', 'health-history', assetId] as const,
  },
  admin: {
    users: () => ['users'] as const,
    auditLogs: (limit?: number) => ['audit-logs', limit ?? 100] as const,
    machinesAll: () => ['machines-all'] as const,
  },
  reports: {
    production: (filters: Record<string, string>) => ['reports', 'production', filters] as const,
  },
  system: {
    health: () => ['system', 'health'] as const,
    liveTelemetry: () => ['system', 'telemetry', 'live'] as const,
    telemetryLog: (count: number) => ['system', 'telemetry', 'log', count] as const,
    connectors: () => ['system', 'connectors'] as const,
  },
};
