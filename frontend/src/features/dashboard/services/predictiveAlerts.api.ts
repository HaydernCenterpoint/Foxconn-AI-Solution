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

interface AlertApiItem {
  alertId: string;
  assetId: string;
  ruleId: string;
  openedAt: string;
  severity: string;
  title: string;
  description?: string | null;
  status: string;
}

interface AlertApiResponse {
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
  return response.alerts.map((alert) => ({
    alert_id: alert.alertId,
    timestamp: alert.openedAt,
    asset_id: alert.assetId,
    event_type: alert.ruleId,
    severity: alert.severity,
    title: alert.title,
    description: alert.description ?? '',
    status: alert.status,
    recommended_actions: [],
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

export const predictiveAlertsApi = {
  listAlerts: (): Promise<PredictiveAlert[]> =>
    DEMO_MODE
      ? Promise.resolve(mapAlertResponse(DEMO_ALERT_RESPONSE))
      : cepApi.get<AlertApiResponse>('/alerts').then((response) => mapAlertResponse(response.data)),

  getHealth: (assetId: string): Promise<AssetHealth> =>
    DEMO_MODE
      ? Promise.resolve(mapHealthResponse(createDemoHealthResponse(assetId)))
      : assetApi.get<HealthApiResponse>(`/assets/${assetId}/health`).then((response) => mapHealthResponse(response.data)),
};

export function isAssetId(value: string): boolean {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
