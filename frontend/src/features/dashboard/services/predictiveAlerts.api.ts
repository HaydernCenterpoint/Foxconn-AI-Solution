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
    cepApi.get<PredictiveAlert[]>('/alerts').then((response) => response.data),

  getHealth: (assetId: string): Promise<AssetHealth> =>
    assetApi.get<AssetHealth>(`/assets/${assetId}/health`).then((response) => response.data),
};

export function isAssetId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
