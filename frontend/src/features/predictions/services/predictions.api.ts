import { api } from '../../../shared/services/apiClient';

export interface AnomalyResult {
  assetId: string;
  isAnomaly: boolean;
  score: number;
  confidence: number;
  reason: string;
  contributingFactors: Record<string, unknown>;
  latencyMs: number;
  timestamp: string;
}

export interface RiskAssessment {
  assetId: string;
  riskScore: number;
  riskLevel: string;
  confidence: number;
  timeWindow: string;
  contributingFactors: Record<string, unknown>;
  latencyMs: number;
  timestamp: string;
}

export const predictionsApi = {
  detectAnomaly: (assetId: string, metricType?: string) =>
    api
      .post<AnomalyResult>('/v1/predictions/anomaly', { assetId, metricType })
      .then((r) => r.data),

  getRisk: (assetId: string, window?: string) =>
    api
      .get<RiskAssessment>(`/v1/predictions/risk/${assetId}`, { params: { window } })
      .then((r) => r.data),
};
