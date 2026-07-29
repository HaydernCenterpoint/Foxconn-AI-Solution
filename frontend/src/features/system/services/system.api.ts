import { api } from '../../../shared/services/apiClient';

export interface HealthCheck {
  name: string;
  status: string;
}

export interface SystemHealth {
  status: string;
  checks: HealthCheck[];
}

export interface TelemetrySnapshot {
  clientId: string;
  machineName: string | null;
  ipAddress: string | null;
  receivedAt: string;
  payload: unknown;
}

export interface ConnectorStatus {
  name: string;
  status: string;
  lastSyncAt: string | null;
  lastSuccessfulSync: string | null;
  recordsSynced: number;
  errors: number;
  errorMessage: string | null;
  running: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function normalizeHealth(value: unknown): SystemHealth {
  if (!isRecord(value)) return { status: 'Unknown', checks: [] };

  const checks = Array.isArray(value.checks)
    ? value.checks.flatMap((check) => {
        if (!isRecord(check)) return [];
        const name = asText(check.name);
        const status = asText(check.status);
        return name && status ? [{ name, status }] : [];
      })
    : [];

  return {
    status: asText(value.status) ?? 'Unknown',
    checks,
  };
}

function normalizeSnapshots(value: unknown): TelemetrySnapshot[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((snapshot) => {
    if (!isRecord(snapshot)) return [];
    const clientId = asText(snapshot.clientId);
    const receivedAt = asText(snapshot.receivedAt);

    if (!clientId || !receivedAt) return [];

    return [{
      clientId,
      machineName: asText(snapshot.machineName),
      ipAddress: asText(snapshot.ipAddress),
      receivedAt,
      payload: snapshot.payload,
    }];
  });
}

export function normalizeConnectors(value: unknown): ConnectorStatus[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((connector) => {
    if (!isRecord(connector)) return [];
    const name = asText(connector.name);
    const status = asText(connector.status);
    if (!name || !status) return [];

    return [{
      name,
      status,
      lastSyncAt: asText(connector.last_sync_at),
      lastSuccessfulSync: asText(connector.last_successful_sync),
      recordsSynced: typeof connector.records_synced === 'number' ? connector.records_synced : 0,
      errors: typeof connector.errors === 'number' ? connector.errors : 0,
      errorMessage: asText(connector.error_message),
      running: connector.running === true,
    }];
  });
}

export const systemApi = {
  getHealth: () => api.get('/health').then((response) => normalizeHealth(response.data)),
  getLiveTelemetry: () => api.get('/telemetry/live').then((response) => normalizeSnapshots(response.data)),
  getTelemetryLog: (count = 20) => api.get('/telemetry/log', { params: { count } }).then((response) => normalizeSnapshots(response.data)),
  getConnectors: () => api.get('/integrations/connectors').then((response) => normalizeConnectors(response.data)),
};
