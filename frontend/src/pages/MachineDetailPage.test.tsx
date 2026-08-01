import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import MachineDetailPage from './MachineDetailPage';

const machinesApiMock = vi.hoisted(() => ({
  getById: vi.fn(),
  getHourlyProduction: vi.fn(),
  getHealth: vi.fn(),
}));

const predictiveAlertsApiMock = vi.hoisted(() => ({
  getHealthHistory: vi.fn(),
}));

vi.mock('../features/machines/services/machines.api', () => ({
  machinesApi: machinesApiMock,
}));

vi.mock('../features/dashboard/services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: predictiveAlertsApiMock,
}));

vi.mock('../features/machines/components/MachineDetailTabs', () => ({
  MachineDetailTabs: () => <div data-testid="machine-tabs" />,
}));

vi.mock('../shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: false }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="health-chart">{children}</div>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Line: () => null,
}));

describe('MachineDetailPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    machinesApiMock.getById.mockResolvedValue({
      id: 'asset-1',
      name: 'Press 01',
      status: 'running',
      approvalStatus: 'approved',
      cpuPercent: 10,
      ramPercent: 20,
      uptimeSeconds: 100,
    });
    machinesApiMock.getHourlyProduction.mockResolvedValue([]);
    machinesApiMock.getHealth.mockResolvedValue({
      machineId: 'asset-1',
      score: 88,
      band: 'healthy',
      calculatedAt: '2026-07-28T00:00:00Z',
      factors: {},
    });
    predictiveAlertsApiMock.getHealthHistory.mockResolvedValue([
      { recorded_at: '2026-07-27T00:00:00Z', health_score: 82 },
      { recorded_at: '2026-07-28T00:00:00Z', health_score: 88 },
    ]);
  });

  it('loads health history for the machine and renders the chart', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/machines/asset-1']}>
            <Routes>
              <Route path="/machines/:id" element={<MachineDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    expect(await screen.findByText('Health history')).toBeInTheDocument();
    expect(screen.getByTestId('health-chart')).toBeInTheDocument();
    await waitFor(() => {
      expect(predictiveAlertsApiMock.getHealthHistory).toHaveBeenCalledWith('asset-1');
    });
  });
});
