import axios from 'axios';
import { useAuthStore } from '../../../shared/store/auth.store';

export interface PredictiveAlert {
  alert_id: string;
  timestamp: string;
  asset_id: string;
  asset_name?: string | null;
  line_code?: string | null;
  event_type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  recommended_actions: string[];
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  evidence?: string | null;
}

export interface AssetHealth {
  asset_id: string;
  recorded_at?: string;
  health_score: number;
  uptime_pct: number;
  alarm_frequency: number;
  performance_pct: number;
  maintenance_overdue: boolean;
}

export interface AssetHealthHistoryPoint {
  recorded_at: string;
  health_score: number;
}

export interface AlertListFilters {
  assetId?: string;
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface AlertStats {
  openCounts: Record<string, number>;
  detailedStats: Array<{ status: string; severity: string; count: number }>;
}

interface AlertApiItem {
  alertId: string;
  assetId: string;
  ruleId: string;
  openedAt: string;
  severity: string;
  title: string;
  description?: string | null;
  status: string;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  evidence?: string | null;
}

interface AlertApiResponse {
  count?: number;
  alerts: AlertApiItem[];
}

interface HealthApiResponse {
  assetId: string;
  overallScore: number;
  breakdown: {
    uptime: { value: number };
    alarms: { count: number };
    performance: { ratio: number };
    maintenance: { overdueDays: number };
  };
}

interface HealthHistoryApiResponse {
  assetId?: string;
  history?: Array<{ recordedAt?: string; overallScore?: number; healthScore?: number }>;
}

const DEMO_MODE = import.meta.env.MODE === 'demo';
const DEMO_ASSET_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_ALERT_RESPONSE: AlertApiResponse = {
  alerts: [{
    alertId: '00000000-0000-0000-0000-000000000101',
    assetId: DEMO_ASSET_ID,
    ruleId: 'predictive-maintenance',
    openedAt: '2026-07-26T08:00:00Z',
    severity: 'high',
    title: 'Predictive maintenance recommended',
    description: 'Recent telemetry indicates maintenance should be scheduled.',
    status: 'open',
  }],
};

function createDemoHealthResponse(assetId: string): HealthApiResponse {
  return {
    assetId,
    overallScore: 94.1,
    breakdown: {
      uptime: { value: 98.4 },
      alarms: { count: 1 },
      performance: { ratio: 91.7 },
      maintenance: { overdueDays: 3 },
    },
  };
}

function createServiceClient(baseURL: string) {
  const client = axios.create({
    baseURL,
    withCredentials: true,
    timeout: 10_000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  return client;
}

const cepApi = createServiceClient(import.meta.env.VITE_CEP_API_URL || '/api/cep');
const assetApi = createServiceClient(import.meta.env.VITE_ASSET_API_URL || '/api/asset-service');

export function mapAlertResponse(response: AlertApiResponse): PredictiveAlert[] {
  return (response.alerts ?? []).map((alert) => ({
    alert_id: alert.alertId,
    timestamp: alert.openedAt,
    asset_id: alert.assetId,
    event_type: alert.ruleId,
    severity: alert.severity,
    title: alert.title,
    description: alert.description ?? '',
    status: alert.status,
    recommended_actions: [],
    acknowledged_by: alert.acknowledgedBy ?? null,
    acknowledged_at: alert.acknowledgedAt ?? null,
    resolved_by: alert.resolvedBy ?? null,
    resolved_at: alert.resolvedAt ?? null,
    evidence: alert.evidence ?? null,
  }));
}

export function mapHealthResponse(response: HealthApiResponse): AssetHealth {
  return {
    asset_id: response.assetId,
    health_score: response.overallScore,
    uptime_pct: response.breakdown.uptime.value,
    alarm_frequency: response.breakdown.alarms.count,
    performance_pct: response.breakdown.performance.ratio,
    maintenance_overdue: response.breakdown.maintenance.overdueDays > 0,
  };
}

function mapHealthHistory(response: HealthHistoryApiResponse): AssetHealthHistoryPoint[] {
  return (response.history ?? []).map((point) => ({
    recorded_at: point.recordedAt ?? '',
    health_score: point.overallScore ?? point.healthScore ?? 0,
  }));
}

function filterDemoAlerts(filters?: AlertListFilters): PredictiveAlert[] {
  let alerts = mapAlertResponse(DEMO_ALERT_RESPONSE);
  if (filters?.status) {
    alerts = alerts.filter((a) => a.status.toLowerCase() === filters.status!.toLowerCase());
  }
  if (filters?.severity) {
    alerts = alerts.filter((a) => a.severity.toLowerCase() === filters.severity!.toLowerCase());
  }
  if (filters?.assetId) {
    alerts = alerts.filter((a) => a.asset_id === filters.assetId);
  }
  if (filters?.limit && filters.limit > 0) {
    alerts = alerts.slice(0, filters.limit);
  }
  return alerts;
}

export const predictiveAlertsApi = {
  listAlerts: (filters?: AlertListFilters): Promise<PredictiveAlert[]> => {
    if (DEMO_MODE) return Promise.resolve(filterDemoAlerts(filters));

    return cepApi
      .get<AlertApiResponse>('/alerts', {
        params: {
          assetId: filters?.assetId,
          status: filters?.status,
          severity: filters?.severity,
          from: filters?.from,
          to: filters?.to,
          limit: filters?.limit ?? 100,
        },
      })
      .then((response) => mapAlertResponse(response.data));
  },

  getAlert: (alertId: string): Promise<PredictiveAlert> => {
    if (DEMO_MODE) {
      const alert = filterDemoAlerts().find((a) => a.alert_id === alertId);
      if (!alert) return Promise.reject(new Error('Alert not found'));
      return Promise.resolve(alert);
    }

    return cepApi.get<AlertApiItem>(`/alerts/${alertId}`).then((response) =>
      mapAlertResponse({ alerts: [response.data] })[0],
    );
  },

  getStats: (): Promise<AlertStats> => {
    if (DEMO_MODE) {
      return Promise.resolve({
        openCounts: { high: 1 },
        detailedStats: [{ status: 'open', severity: 'high', count: 1 }],
      });
    }

    return cepApi.get<AlertStats>('/alerts/stats').then((response) => response.data);
  },

  acknowledgeAlert: (alertId: string, notes?: string): Promise<void> => {
    if (DEMO_MODE) return Promise.resolve();
    return cepApi
      .post(`/alerts/${alertId}/acknowledge`, notes ? { notes } : {})
      .then(() => undefined);
  },

  resolveAlert: (alertId: string, notes?: string): Promise<void> => {
    if (DEMO_MODE) return Promise.resolve();
    return cepApi
      .post(`/alerts/${alertId}/resolve`, { notes: notes ?? '' })
      .then(() => undefined);
  },

  getHealth: (assetId: string): Promise<AssetHealth> =>
    DEMO_MODE
      ? Promise.resolve(mapHealthResponse(createDemoHealthResponse(assetId)))
      : assetApi
          .get<HealthApiResponse>(`/assets/${assetId}/health`)
          .then((response) => mapHealthResponse(response.data)),

  getHealthHistory: (assetId: string, from?: string, to?: string): Promise<AssetHealthHistoryPoint[]> => {
    if (DEMO_MODE) {
      return Promise.resolve([
        { recorded_at: '2026-07-25T00:00:00Z', health_score: 92 },
        { recorded_at: '2026-07-26T00:00:00Z', health_score: 94.1 },
      ]);
    }

    return assetApi
      .get<HealthHistoryApiResponse>(`/assets/${assetId}/health/history`, {
        params: { from, to },
      })
      .then((response) => mapHealthHistory(response.data));
  },
};

export function isAssetId(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function healthColorVariant(score: number): 'success' | 'warning' | 'error' {
  if (score >= 71) return 'success';
  if (score >= 41) return 'warning';
  return 'error';
}

/** Worst-child roll-up: min score across known children; null if none available. */
export function rollUpHealthScores(scores: Array<number | null | undefined>): number | null {
  const values = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (values.length === 0) return null;
  return Math.min(...values);
}
