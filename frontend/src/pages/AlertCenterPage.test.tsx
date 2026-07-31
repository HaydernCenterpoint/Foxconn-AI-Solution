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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const permissionsMock = vi.hoisted(() => ({
  canAcknowledge: false,
}));

vi.mock('../features/dashboard/services/predictiveAlerts.api', () => ({
  predictiveAlertsApi: predictiveAlertsApiMock,
}));

vi.mock('../shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ canAcknowledge: permissionsMock.canAcknowledge }),
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
    predictiveAlertsApiMock.acknowledgeAlert.mockResolvedValue(undefined);
    predictiveAlertsApiMock.resolveAlert.mockResolvedValue(undefined);
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

  it('acknowledges an open alert when the engineer has permission', async () => {
    permissionsMock.canAcknowledge = true;
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Bearing temperature high')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    const notes = await screen.findByPlaceholderText(/Root cause/i);
    await user.type(notes, 'Checked sensor');
    fireEvent.submit(document.getElementById('alert-center-action-form')!);

    await waitFor(() => {
      expect(predictiveAlertsApiMock.acknowledgeAlert).toHaveBeenCalledWith(
        'alert-1',
        expect.stringContaining('Checked sensor'),
      );
    });
  });

  it('exports the current alert list as CSV', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn((object: Blob | MediaSource) => {
      void object;
      return 'blob:alert-export';
    });
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);

    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName);
      if (tagName === 'a') {
        Object.defineProperty(el, 'click', { configurable: true, value: click });
      }
      return el;
    });

    try {
      renderPage();
      expect(await screen.findByText('Bearing temperature high')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob.type).toContain('text/csv');
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:alert-export');
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
      vi.restoreAllMocks();
    }
  });
});
