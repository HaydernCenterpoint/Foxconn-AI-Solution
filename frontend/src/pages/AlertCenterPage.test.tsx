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
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import AlertCenterPage from './AlertCenterPage';

const predictiveAlertsApiMock = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getAlert: vi.fn(),
  getRca: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));
const permissionsMock = vi.hoisted(() => ({ canAcknowledge: false }));

vi.mock('../features/dashboard/services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: predictiveAlertsApiMock,
}));

vi.mock('../shared/hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock,
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
    permissionsMock.canAcknowledge = false;
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
    predictiveAlertsApiMock.getAlert.mockResolvedValue({
      alert_id: 'alert-1',
      timestamp: '2026-07-21T10:00:00Z',
      asset_id: 'asset-1',
      event_type: 'bearing-temperature',
      severity: 'critical',
      title: 'Bearing temperature high',
      description: 'Bearing temperature exceeded the operating threshold.',
      status: 'open',
      recommended_actions: [],
      evidence: '{"metric":"temperature","value":92.4,"threshold":80}',
    });
    predictiveAlertsApiMock.getRca.mockResolvedValue({
      rca: {
        rca_id: 'rca-1',
        timestamp: '2026-07-21T10:00:01Z',
        root_cause_event_id: 'event-1',
        root_cause_type: 'lubrication_loss',
        root_cause_asset_id: 'asset-1',
        root_cause_description: 'Insufficient lubrication increased bearing friction.',
        causal_chain: ['event-0', 'event-1'],
        causal_chain_events: [
          {
            event_id: 'event-0',
            type: 'lubrication_pressure_dropped',
            timestamp: '2026-07-21T09:55:00Z',
            asset_id: 'asset-1',
            severity: 'warning',
            payload: {},
          },
          {
            event_id: 'event-1',
            type: 'bearing_temperature_increased',
            timestamp: '2026-07-21T10:00:00Z',
            asset_id: 'asset-1',
            severity: 'critical',
            payload: {},
          },
        ],
        confidence_score: 0.91,
        recommended_actions: ['Inspect the lubrication system', 'Check the bearing for damage'],
      },
    });
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

  it('loads and renders structured evidence when an alert is expanded', async () => {
    permissionsMock.canAcknowledge = true;
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Bearing temperature high/i }));

    expect(await screen.findByText('Evidence')).toBeInTheDocument();
    expect(await screen.findByText('metric')).toBeInTheDocument();
    expect(screen.getByText('temperature')).toBeInTheDocument();
    expect(screen.getByText('92.4')).toBeInTheDocument();
    expect(predictiveAlertsApiMock.getAlert).toHaveBeenCalledWith('alert-1');
    expect(predictiveAlertsApiMock.getRca).toHaveBeenCalledWith(
      expect.objectContaining({ alert_id: 'alert-1', asset_id: 'asset-1' }),
    );
    expect(await screen.findByText('Insufficient lubrication increased bearing friction.')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('lubrication pressure dropped')).toBeInTheDocument();
    expect(screen.queryByText('event-0')).not.toBeInTheDocument();
    expect(screen.getByText('Inspect the lubrication system')).toBeInTheDocument();
    expect(screen.getByText('Basic event correlation only; no LLM analysis is used.')).toBeInTheDocument();
  });

  it('shows an unavailable state when no RCA can be produced', async () => {
    permissionsMock.canAcknowledge = true;
    predictiveAlertsApiMock.getRca.mockResolvedValueOnce({ rca: null });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Bearing temperature high/i }));

    expect(await screen.findByText('Root cause analysis is unavailable for this alert.')).toBeInTheDocument();
  });

  it('does not request protected RCA data for view-only users', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Bearing temperature high/i }));

    expect(await screen.findByText('Root cause analysis is unavailable for this alert.')).toBeInTheDocument();
    expect(predictiveAlertsApiMock.getRca).not.toHaveBeenCalled();
  });
});
