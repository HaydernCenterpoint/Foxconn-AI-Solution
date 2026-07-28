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
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import AlertCenterPage from './AlertCenterPage';

const predictiveAlertsApiMock = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

vi.mock('../features/dashboard/services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: predictiveAlertsApiMock,
}));

vi.mock('../shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAcknowledge: false }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/alerts']}>
          <AlertCenterPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AlertCenterPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testStorage.clear();
    await i18n.changeLanguage('en');
    predictiveAlertsApiMock.listAlerts.mockResolvedValue([
      {
        alert_id: 'alert-1',
        timestamp: '2026-07-21T10:00:00Z',
        asset_id: 'asset-1',
        event_type: 'bearing-temperature',
        severity: 'critical',
        title: 'Bearing temperature high',
        description: 'Bearing temperature exceeded the operating threshold.',
        status: 'open',
        recommended_actions: [],
      },
    ]);
  });

  it('renders alerts returned by the API using the default open filter', async () => {
    renderPage();

    expect(await screen.findByText('Bearing temperature high')).toBeInTheDocument();
    expect(screen.getByText('asset-1')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    await waitFor(() => {
      expect(predictiveAlertsApiMock.listAlerts).toHaveBeenCalledWith({
        status: 'open',
        severity: undefined,
        limit: 200,
      });
    });
  });
});
