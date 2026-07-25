import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '../../../../test/test-utils';
import { HealthScoreCard } from '../HealthScoreCard';
import { healthApi } from '../../services/health.api';
import type { HealthScore } from '../../services/health.api';

vi.mock('../../services/health.api', () => ({
  healthApi: {
    getScore: vi.fn(),
    getHistory: vi.fn(),
    compute: vi.fn(),
  },
}));

const mockHealthScore: HealthScore = {
  assetId: 'test',
  overallScore: 85,
  colorCode: '#22c55e',
  breakdown: {
    uptime: { value: 95, weight: 40, contribution: 38 },
    alarms: { count: 2, weight: 30, score: 80, contribution: 24 },
    performance: { ratio: 88, weight: 20, contribution: 17.6 },
    maintenance: { overdueDays: 0, weight: 10, score: 100, contribution: 10 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HealthScoreCard', () => {
  it('renders health score badge and breakdown', async () => {
    vi.mocked(healthApi.getScore).mockResolvedValue(mockHealthScore);

    render(<HealthScoreCard assetId="test" />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByLabelText('Health score 85')).toBeInTheDocument();
    });

    // Health score label
    expect(screen.getByText('health.healthScore')).toBeInTheDocument();

    // Breakdown keys should appear as translated labels
    expect(screen.getByText('health.uptime')).toBeInTheDocument();
    expect(screen.getByText('health.alarms')).toBeInTheDocument();
    expect(screen.getByText('health.performance')).toBeInTheDocument();
    expect(screen.getByText('health.maintenance')).toBeInTheDocument();

    // Display values: uptime 95%, alarms count 2, performance 88%, maintenance 0d
    expect(screen.getByText('95%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('0d')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    vi.mocked(healthApi.getScore).mockReturnValue(new Promise(() => {}));

    render(<HealthScoreCard assetId="test" />);

    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders error state on API error', async () => {
    vi.mocked(healthApi.getScore).mockRejectedValue(new Error('Network error'));

    render(<HealthScoreCard assetId="test" />);

    await waitFor(() => {
      expect(screen.getByText('common.error')).toBeInTheDocument();
    });
  });
});
