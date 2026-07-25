import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../../test/test-utils';
import { RiskGauge } from '../RiskGauge';
import { predictionsApi } from '../../services/predictions.api';
import type { RiskAssessment } from '../../services/predictions.api';

vi.mock('../../services/predictions.api', () => ({
  predictionsApi: {
    detectAnomaly: vi.fn(),
    getRisk: vi.fn(),
  },
}));

const mockRisk: RiskAssessment = {
  assetId: 'test',
  riskScore: 0.72,
  riskLevel: 'high',
  confidence: 0.85,
  timeWindow: '1h',
  contributingFactors: { temperatureSpike: 0.72, vibrationIncrease: 0.41 },
  latencyMs: 45,
  timestamp: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RiskGauge', () => {
  it('renders risk gauge with score', async () => {
    vi.mocked(predictionsApi.getRisk).mockResolvedValue(mockRisk);

    render(<RiskGauge assetId="test" />);

    await waitFor(() => {
      // The score is rendered inside the SVG <text> element
      expect(screen.getByText('72')).toBeInTheDocument();
    });

    // Confidence display: 85%
    expect(screen.getByText(/85%/)).toBeInTheDocument();
  });

  it('renders normalized fractional risk scores as percentages', async () => {
    vi.mocked(predictionsApi.getRisk).mockResolvedValue(mockRisk);

    render(<RiskGauge assetId="test" />);

    await waitFor(() => {
      expect(screen.getByText('72')).toBeInTheDocument();
    });
  });

  it('renders badge with risk level', async () => {
    vi.mocked(predictionsApi.getRisk).mockResolvedValue(mockRisk);

    render(<RiskGauge assetId="test" />);

    await waitFor(() => {
      // The badge shows the translated risk level key with defaultValue fallback
      expect(screen.getByText('high')).toBeInTheDocument();
    });
  });

  it('renders contributing factors list', async () => {
    vi.mocked(predictionsApi.getRisk).mockResolvedValue(mockRisk);

    render(<RiskGauge assetId="test" />);

    await waitFor(() => {
      expect(screen.getByText('predictions.factors')).toBeInTheDocument();
    });

    expect(screen.getByText('temperatureSpike: 0.72')).toBeInTheDocument();
    expect(screen.getByText('vibrationIncrease: 0.41')).toBeInTheDocument();
  });
});
