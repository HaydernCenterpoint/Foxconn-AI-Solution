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
  recorded_at: string;
  health_score: number;
  uptime_pct: number;
  alarm_frequency: number;
  performance_pct: number;
  maintenance_overdue: boolean;
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

export const predictiveAlertsApi = {
  listAlerts: (): Promise<PredictiveAlert[]> =>
    cepApi
      .get<unknown>('/alerts')
      .then((response) => {
        const data = response.data;
        const raw = Array.isArray(data)
          ? data
          : (data && typeof data === 'object' && 'alerts' in data && Array.isArray((data as { alerts: unknown[] }).alerts))
            ? (data as { alerts: unknown[] }).alerts
            : [];

        return raw.map((item: any) => ({
          alert_id: String(item.alert_id ?? item.alertId ?? item.id ?? ''),
          timestamp: String(item.timestamp ?? item.openedAt ?? item.opened_at ?? new Date().toISOString()),
          asset_id: String(item.asset_id ?? item.assetId ?? ''),
          asset_name: item.asset_name ?? item.assetName ?? null,
          line_code: item.line_code ?? item.lineCode ?? null,
          event_type: String(item.event_type ?? item.eventType ?? item.ruleId ?? 'ALERT'),
          severity: String(item.severity ?? 'MEDIUM'),
          title: String(item.title ?? 'Alert'),
          description: String(item.description ?? ''),
          status: String(item.status ?? 'OPEN'),
          recommended_actions: Array.isArray(item.recommended_actions)
            ? item.recommended_actions
            : Array.isArray(item.recommendedActions)
              ? item.recommendedActions
              : (item.evidence ? [String(item.evidence)] : []),
        }));
      })
      .catch((error) => {
        console.warn('Predictive alerts unavailable:', error?.message);
        return [];
      }),

  getHealth: (assetId: string): Promise<AssetHealth> =>
    assetApi
      .get<unknown>(`/assets/${assetId}/health`)
      .then((response) => {
        const item: any = response.data || {};
        return {
          asset_id: String(item.asset_id ?? item.assetId ?? assetId),
          recorded_at: String(item.recorded_at ?? item.recordedAt ?? item.calculatedAt ?? new Date().toISOString()),
          health_score: Number(item.health_score ?? item.healthScore ?? item.overallHealthScore ?? 100),
          uptime_pct: Number(item.uptime_pct ?? item.uptimePct ?? 100),
          alarm_frequency: Number(item.alarm_frequency ?? item.alarmFrequency ?? 0),
          performance_pct: Number(item.performance_pct ?? item.performancePct ?? 100),
          maintenance_overdue: Boolean(item.maintenance_overdue ?? item.maintenanceOverdue ?? false),
        };
      })
      .catch((error) => {
        console.warn(`Health score unavailable for asset ${assetId}:`, error?.message);
        return {
          asset_id: assetId,
          recorded_at: new Date().toISOString(),
          health_score: 100,
          uptime_pct: 100,
          alarm_frequency: 0,
          performance_pct: 100,
          maintenance_overdue: false,
        };
      }),
};

export function isAssetId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
