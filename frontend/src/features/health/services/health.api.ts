import { api } from '../../../shared/services/apiClient';

export interface HealthBreakdownItem {
  value?: number;
  count?: number;
  ratio?: number;
  overdueDays?: number;
  weight: number;
  score?: number;
  contribution: number;
}

export interface HealthBreakdown {
  uptime: HealthBreakdownItem;
  alarms: HealthBreakdownItem;
  performance: HealthBreakdownItem;
  maintenance: HealthBreakdownItem;
}

export interface HealthScore {
  assetId: string;
  overallScore: number;
  colorCode: string;
  breakdown: HealthBreakdown;
}

export interface HealthRecord {
  timestamp: string;
  score: number;
  metadata?: string;
}

export interface HealthHistoryResponse {
  assetId: string;
  from: string;
  to: string;
  count: number;
  history: HealthRecord[];
}

export interface HealthComputeResponse {
  assetId: string;
  score: number;
  computedAt: string;
}

export const healthApi = {
  getScore: (assetId: string) =>
    api.get<HealthScore>(`/v1/assets/${assetId}/health`).then((r) => r.data),

  getHistory: (assetId: string, from?: string, to?: string) =>
    api
      .get<HealthHistoryResponse>(`/v1/assets/${assetId}/health/history`, {
        params: { from, to },
      })
      .then((r) => r.data),

  compute: (assetId: string) =>
    api
      .post<HealthComputeResponse>(`/v1/assets/${assetId}/health/compute`)
      .then((r) => r.data),
};
