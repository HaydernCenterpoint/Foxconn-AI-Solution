import { api } from '../../../shared/services/apiClient';

export interface Alert {
  alertId: string;
  eventId: string;
  assetId: string;
  ruleId: string;
  openedAt: string;
  closedAt?: string;
  status: string;
  severity: string;
  title: string;
  description?: string;
  evidence?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface AlertDetail extends Alert {
  resolutionNotes?: string;
  suppressionReason?: string;
}

export interface AlertStats {
  openCounts: Record<string, number>;
  detailedStats: { status: string; severity: string; count: number }[];
}

export interface AlertFilters {
  assetId?: string;
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
}

interface AlertListResponse {
  count: number;
  alerts: Alert[];
}

interface AlertActionResponse {
  message: string;
  alertId: string;
}

export const alertsApi = {
  getAll: (filters?: AlertFilters) =>
    api
      .get<AlertListResponse>('/v1/alerts', {
        params: { limit: 100, ...filters },
      })
      .then((r) => r.data),

  getById: (id: string) =>
    api.get<AlertDetail>(`/v1/alerts/${id}`).then((r) => r.data),

  acknowledge: (id: string) =>
    api
      .post<AlertActionResponse>(`/v1/alerts/${id}/acknowledge`, {})
      .then((r) => r.data),

  resolve: (id: string, notes?: string) =>
    api
      .post<AlertActionResponse>(`/v1/alerts/${id}/resolve`, {
        Notes: notes,
      })
      .then((r) => r.data),

  getStats: () =>
    api.get<AlertStats>('/v1/alerts/stats').then((r) => r.data),
};
