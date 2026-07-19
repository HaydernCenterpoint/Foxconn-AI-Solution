const testStorage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  }

  return storage;
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import ReportsPage from './ReportsPage';

const linesApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const machinesApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('../features/production-lines/services/lines.api', () => ({
  linesApi: linesApiMock,
}));

vi.mock('../features/machines/services/machines.api', () => ({
  machinesApi: machinesApiMock,
}));

vi.mock('../shared/services/apiClient', () => ({
  api: apiMock,
}));

const reportData = {
  summary: {
    totalProduction: 1250,
    totalGood: 1190,
    totalScrap: 60,
    yieldRate: 95.2,
    scrapRate: 4.8,
    avgSpeed: 156,
    machinesCount: 1,
  },
  chartData: [
    { hour: '08:00', output: 580 },
    { hour: '09:00', output: 670 },
  ],
  defectChartData: [
    { name: 'Dimension', value: 34, color: '#ef4444' },
    { name: 'Surface', value: 26, color: '#f97316' },
  ],
  tableLogs: [
    {
      key: 'log-1',
      no: 1,
      lineName: 'Assembly',
      machineName: 'Press A',
      output: 1250,
      good: 1190,
      scrap: 60,
      status: 'running',
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('ReportsPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testStorage.clear();
    await i18n.changeLanguage('en');
    linesApiMock.getAll.mockResolvedValue([
      { id: 'line-1', name: 'Assembly', status: 'active' },
    ]);
    machinesApiMock.getAll.mockResolvedValue([
      {
        id: 'machine-1',
        name: 'Press A',
        lineId: 'line-1',
        approvalStatus: 'APPROVED',
        status: 'running',
      },
    ]);
    apiMock.get.mockResolvedValue({ data: reportData });
  });

  it('renders backend report metrics and logs in the modern report surface', async () => {
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Performance & Output Report' })).toBeInTheDocument();
    expect(container.querySelector('.reports-page')).not.toBeNull();
    expect(container.querySelector('.cyber-panel')).toBeNull();
    await waitFor(() => {
      expect(screen.getAllByText('1,250')).not.toHaveLength(0);
    });
    expect(screen.getByText('95.2%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Report' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Assembly' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Press A' })).toBeInTheDocument();

    await waitFor(() => {
      expect(apiMock.get).toHaveBeenCalledWith('/reports/query', {
        params: { timeRange: 'today', lineId: 'all', machineId: 'all' },
      });
    });
  });
});
