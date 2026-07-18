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

export const systemApi = {
  getHealth: () => api.get('/health').then((response) => normalizeHealth(response.data)),
  getLiveTelemetry: () => api.get('/telemetry/live').then((response) => normalizeSnapshots(response.data)),
  getTelemetryLog: (count = 20) => api.get('/telemetry/log', { params: { count } }).then((response) => normalizeSnapshots(response.data)),
};
