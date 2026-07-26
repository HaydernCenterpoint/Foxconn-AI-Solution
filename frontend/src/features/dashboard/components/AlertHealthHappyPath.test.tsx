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
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { initReactI18next, I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../../app/i18n/en';
import { ModernDashboardPage } from './ModernDashboardPage';

const apiMocks = vi.hoisted(() => ({
  summary: vi.fn(),
  lines: vi.fn(),
  machines: vi.fn(),
  alerts: vi.fn(),
  health: vi.fn(),
}));

vi.mock('../services/dashboard.api', () => ({ dashboardApi: { getSummary: apiMocks.summary } }));
vi.mock('../../production-lines/services/lines.api', () => ({ linesApi: { getAll: apiMocks.lines } }));
vi.mock('../../machines/services/machines.api', () => ({ machinesApi: { getAll: apiMocks.machines } }));
vi.mock('../services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: { listAlerts: apiMocks.alerts, getHealth: apiMocks.health },
  isAssetId: (value: string) => /^[0-9a-f-]{36}$/i.test(value),
}));

const assetId = '7f17cc6a-83a5-42f9-94b2-c65aee9f2115';
const testI18n = createInstance();

describe('alert and health happy path', () => {
  beforeAll(async () => {
    await testI18n.use(initReactI18next).init({
      resources: { en: { translation: en } },
      lng: 'en',
      interpolation: { escapeValue: false },
    });
  });

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    apiMocks.summary.mockResolvedValue({
      totalLines: 1,
      totalMachines: 1,
      running: 1,
      idle: 0,
      error: 0,
      offline: 0,
      totalProduction: 20,
      activeAlarms: 0,
      plcClientsOnline: 1,
      recentAlarms: [],
      hourlyData: [],
    });
    apiMocks.lines.mockResolvedValue([]);
    apiMocks.machines.mockResolvedValue([]);
    apiMocks.alerts.mockResolvedValue([{
      alert_id: 'alert-1',
      timestamp: '2026-07-21T10:00:00Z',
      asset_id: assetId,
      asset_name: 'Press-001',
      event_type: 'vibration_anomaly',
      severity: 'critical',
      title: 'Predicted bearing failure',
      description: 'Vibration and temperature are rising together.',
      status: 'active',
      recommended_actions: ['Inspect bearing lubrication'],
    }]);
    apiMocks.health.mockResolvedValue({
      asset_id: assetId,
      recorded_at: '2026-07-21T10:00:00Z',
      health_score: 82,
      uptime_pct: 99,
      alarm_frequency: 1,
      performance_pct: 96,
      maintenance_overdue: false,
    });
  });

  it('loads the CEP alert and Asset health score, then reveals the drill-down', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={testI18n}>
          <MemoryRouter><ModernDashboardPage role="engineer" /></MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    try {
      const alertTitle = await screen.findByText('Predicted bearing failure');
      await screen.findByText('Health 82%');
      await waitFor(() => expect(apiMocks.health).toHaveBeenCalledWith(assetId));

      const details = alertTitle.closest('details');
      expect(details).not.toHaveAttribute('open');
      await user.click(alertTitle);

      expect(details).toHaveAttribute('open');
      expect(screen.getByText('Vibration and temperature are rising together.')).toBeVisible();
      expect(screen.getByText('Inspect bearing lubrication')).toBeVisible();
      expect(screen.getByText('99%')).toBeVisible();
      expect(screen.getByText('96%')).toBeVisible();
      expect(screen.getByText('On schedule')).toBeVisible();
    } finally {
      view.unmount();
      queryClient.clear();
    }
  });

  it('shows unavailable states without blocking the dashboard', async () => {
    apiMocks.alerts.mockRejectedValue(new Error('CEP unavailable'));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={testI18n}>
          <MemoryRouter><ModernDashboardPage role="engineer" /></MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );

    try {
      expect(await screen.findByText('Predictive alerts are unavailable')).toBeVisible();
      expect(screen.getByText('Production overview')).toBeVisible();
    } finally {
      view.unmount();
      queryClient.clear();
    }
  });
});
