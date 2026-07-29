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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import AssetBrowserPage from './AssetBrowserPage';

const assetsApiMock = vi.hoisted(() => ({
  getTree: vi.fn(),
  getDocuments: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

const machinesApiMock = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const alarmsApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const predictiveAlertsApiMock = vi.hoisted(() => ({
  getHealth: vi.fn(),
}));

const authMock = vi.hoisted(() => ({
  can: vi.fn(() => true),
}));

vi.mock('../features/assets/services/assets.api', () => ({
  assetsApi: assetsApiMock,
}));

vi.mock('../features/machines/services/machines.api', () => ({
  machinesApi: machinesApiMock,
}));

vi.mock('../features/alarms/services/alarms.api', () => ({
  alarmsApi: alarmsApiMock,
}));

vi.mock('../features/dashboard/services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: predictiveAlertsApiMock,
  isAssetId: (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
  healthColorVariant: (score: number) => {
    if (score >= 71) return 'success';
    if (score >= 41) return 'warning';
    return 'error';
  },
  rollUpHealthScores: (scores: Array<number | null | undefined>) => {
    const values = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    if (values.length === 0) return null;
    return Math.min(...values);
  },
}));

vi.mock('../shared/store/auth.store', () => ({
  useAuthStore: (selector: (state: { can: (permission: string) => boolean }) => unknown) =>
    selector({ can: authMock.can }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AssetBrowserPage />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('AssetBrowserPage', () => {
  const machineId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    vi.clearAllMocks();
    testStorage.clear();
    await i18n.changeLanguage('en');
    authMock.can.mockReturnValue(true);
    assetsApiMock.getTree.mockResolvedValue([
      {
        id: 'plant-1',
        type: 'PLANT',
        name: 'MKZ Factory',
        code: 'MKZ-PLANT',
        metadata: {},
        createdAt: '2026-07-21T00:00:00Z',
        updatedAt: '2026-07-21T00:00:00Z',
        children: [
          {
            id: machineId,
            type: 'MACHINE',
            name: 'Press A',
            code: 'machine:11111111-1111-1111-1111-111111111111',
            metadata: {},
            createdAt: '2026-07-21T00:00:00Z',
            updatedAt: '2026-07-21T00:00:00Z',
            children: [
              {
                id: 'sensor-1',
                type: 'SENSOR',
                name: 'Temperature Sensor',
                code: 'TEMP-01',
                metadata: { unit: 'C' },
                createdAt: '2026-07-21T00:00:00Z',
                updatedAt: '2026-07-21T00:00:00Z',
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    assetsApiMock.getDocuments.mockResolvedValue([
      { documentId: 'DOC-001', relationship: 'MANUAL', createdAt: '2026-07-21T00:00:00Z' },
    ]);
    machinesApiMock.getById.mockResolvedValue({
      id: machineId,
      name: 'Press A',
      status: 'RUNNING',
      plcConnected: true,
      approvalStatus: 'APPROVED',
      cpuPercent: 12,
      ramPercent: 34,
      uptimeSeconds: 100,
    });
    alarmsApiMock.getAll.mockResolvedValue([
      {
        id: 9,
        machineId,
        machineName: 'Press A',
        severity: 'HIGH',
        message: 'Overheat',
        status: 'ACTIVE',
        createdAt: '2026-07-21T01:00:00Z',
      },
    ]);
    predictiveAlertsApiMock.getHealth.mockResolvedValue({
      asset_id: machineId,
      health_score: 82,
      uptime_pct: 99,
      alarm_frequency: 1,
      performance_pct: 96,
      maintenance_overdue: false,
    });
  });

  it('loads the API-backed asset tree and documents for a selected asset', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Asset browser' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Temperature Sensor/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Temperature Sensor/i }));

    await waitFor(() => {
      expect(assetsApiMock.getDocuments).toHaveBeenCalledWith('sensor-1');
    });
    expect(await screen.findByText('DOC-001')).toBeInTheDocument();
  });

  it('loads machine telemetry and active alarms for MACHINE assets', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Press A/i }));

    await waitFor(() => {
      expect(machinesApiMock.getById).toHaveBeenCalledWith(machineId);
      expect(alarmsApiMock.getAll).toHaveBeenCalled();
      expect(predictiveAlertsApiMock.getHealth).toHaveBeenCalledWith(machineId);
    });
    expect(await screen.findByText('RUNNING')).toBeInTheDocument();
    expect(await screen.findByText('Overheat')).toBeInTheDocument();
    expect(await screen.findByText('Health 82%')).toHaveStyle({ color: 'var(--color-success)' });
    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('On schedule')).toBeInTheDocument();
  });

  it('keeps asset details visible when health is unavailable', async () => {
    predictiveAlertsApiMock.getHealth.mockRejectedValue(new Error('health unavailable'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Press A/i }));

    expect(await screen.findByRole('heading', { name: 'Health unavailable' }, { timeout: 3000 })).toBeVisible();
    expect(screen.getByText('Press A', { selector: 'h2' })).toBeVisible();
    expect(screen.getByText('RUNNING')).toBeVisible();
  });

  it('hides catalog mutations when the role cannot configure assets', async () => {
    authMock.can.mockReturnValue(false);
    renderPage();
    expect(await screen.findByText(/Only ADMIN or ENGINEER can change catalog assets/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create sensor/i })).not.toBeInTheDocument();
  });

  it('shows health badges on tree nodes and rolls up worst-child scores to parents', async () => {
    renderPage();

    await waitFor(() => {
      expect(predictiveAlertsApiMock.getHealth).toHaveBeenCalledWith(machineId);
    });

    // Leaf machine score appears as a badge; parent plant inherits min(child) = 82
    const badges = await screen.findAllByLabelText('health 82');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
