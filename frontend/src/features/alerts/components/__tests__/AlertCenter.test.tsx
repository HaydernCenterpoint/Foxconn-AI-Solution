import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '../../../../test/test-utils';
import { AlertCenter } from '../AlertCenter';
import { alertsApi } from '../../services/alerts.api';
import type { Alert, AlertDetail, AlertStats } from '../../services/alerts.api';

vi.mock('../../services/alerts.api', () => ({
  alertsApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getStats: vi.fn(),
    acknowledge: vi.fn(),
    resolve: vi.fn(),
  },
}));

const mockAlert1: Alert = {
  alertId: 'alert-001',
  eventId: 'evt-001',
  assetId: 'machine-A',
  ruleId: 'rule-temp',
  openedAt: '2026-01-15T10:30:00Z',
  status: 'Open',
  severity: 'Critical',
  title: 'Temperature Exceeded Limit',
  description: 'Sensor T-01 reading above threshold',
};

const mockAlert2: Alert = {
  alertId: 'alert-002',
  eventId: 'evt-002',
  assetId: 'machine-B',
  ruleId: 'rule-vibration',
  openedAt: '2026-01-15T11:00:00Z',
  status: 'Acknowledged',
  severity: 'High',
  title: 'Vibration Anomaly Detected',
  description: 'Excessive vibration on spindle motor',
};

const mockStats: AlertStats = {
  openCounts: { critical: 1, high: 1, medium: 0, low: 0 },
  detailedStats: [
    { status: 'open', severity: 'critical', count: 1 },
    { status: 'acknowledged', severity: 'high', count: 1 },
  ],
};

const mockAlertDetail: AlertDetail = {
  ...mockAlert1,
  resolutionNotes: undefined,
  suppressionReason: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlertCenter', () => {
  it('renders loading state', () => {
    // getAll returns a promise that never resolves → loading state persists
    vi.mocked(alertsApi.getAll).mockReturnValue(new Promise(() => {}));
    vi.mocked(alertsApi.getStats).mockReturnValue(new Promise(() => {}));

    render(<AlertCenter />);

    expect(screen.getByText('alerts.loading')).toBeInTheDocument();
  });

  it('renders alerts table when data loads', async () => {
    vi.mocked(alertsApi.getAll).mockResolvedValue({
      count: 2,
      alerts: [mockAlert1, mockAlert2],
    });
    vi.mocked(alertsApi.getStats).mockResolvedValue(mockStats);

    render(<AlertCenter />);

    await waitFor(() => {
      expect(screen.getByText('Temperature Exceeded Limit')).toBeInTheDocument();
    });

    expect(screen.getByText('Vibration Anomaly Detected')).toBeInTheDocument();
    // Table headers should be rendered
    expect(screen.getByText('alerts.table.title')).toBeInTheDocument();
    expect(screen.getByText('alerts.table.severity')).toBeInTheDocument();
    expect(screen.getByText('alerts.table.status')).toBeInTheDocument();
  });

  it('renders empty state when no alerts', async () => {
    vi.mocked(alertsApi.getAll).mockResolvedValue({ count: 0, alerts: [] });
    vi.mocked(alertsApi.getStats).mockResolvedValue({
      openCounts: {},
      detailedStats: [],
    });

    render(<AlertCenter />);

    await waitFor(() => {
      expect(screen.getByText('alerts.empty')).toBeInTheDocument();
    });

    expect(screen.getByText('alerts.emptyDescription')).toBeInTheDocument();
  });

  it('clicking an alert opens detail panel', async () => {
    const user = userEvent.setup();

    vi.mocked(alertsApi.getAll).mockResolvedValue({
      count: 2,
      alerts: [mockAlert1, mockAlert2],
    });
    vi.mocked(alertsApi.getStats).mockResolvedValue(mockStats);
    vi.mocked(alertsApi.getById).mockResolvedValue(mockAlertDetail);

    render(<AlertCenter />);

    // Wait for the table to render
    await waitFor(() => {
      expect(screen.getByText('Temperature Exceeded Limit')).toBeInTheDocument();
    });

    // Click on the first alert row
    await user.click(screen.getByText('Temperature Exceeded Limit'));

    // Wait for detail panel to appear
    await waitFor(() => {
      expect(alertsApi.getById).toHaveBeenCalledWith('alert-001');
    });

    // Detail panel should show alert info
    await waitFor(() => {
      expect(screen.getByText('alerts.detail.header')).toBeInTheDocument();
    });

    // The alert ID should be visible in the detail panel
    expect(screen.getByText('alert-001')).toBeInTheDocument();
    // machine-A appears in both the table row and the detail panel
    const machineTexts = screen.getAllByText('machine-A');
    expect(machineTexts.length).toBeGreaterThanOrEqual(2);
  });
});
