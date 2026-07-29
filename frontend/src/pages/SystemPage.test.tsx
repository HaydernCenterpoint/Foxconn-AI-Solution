import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import { useAuthStore } from '../shared/store/auth.store';
import SystemPage from './SystemPage';

const systemApiMock = vi.hoisted(() => ({
  getHealth: vi.fn(),
  getLiveTelemetry: vi.fn(),
  getTelemetryLog: vi.fn(),
  getConnectors: vi.fn(),
}));

vi.mock('../features/system/services/system.api', () => ({
  systemApi: systemApiMock,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SystemPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('SystemPage connector status', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('en');
    useAuthStore.setState({
      role: 'ADMIN',
      isAuthenticated: true,
      sessionChecked: true,
    });
    systemApiMock.getHealth.mockResolvedValue({ status: 'Healthy', checks: [] });
    systemApiMock.getLiveTelemetry.mockResolvedValue([]);
    systemApiMock.getTelemetryLog.mockResolvedValue([]);
    systemApiMock.getConnectors.mockResolvedValue([
      {
        name: 'erp',
        status: 'success',
        lastSyncAt: '2026-07-28T10:00:00Z',
        lastSuccessfulSync: '2026-07-28T10:00:00Z',
        recordsSynced: 1240,
        errors: 0,
        errorMessage: null,
        running: true,
      },
      {
        name: 'mes',
        status: 'error',
        lastSyncAt: null,
        lastSuccessfulSync: null,
        recordsSynced: 0,
        errors: 2,
        errorMessage: 'Source unavailable',
        running: false,
      },
    ]);
  });

  it('shows connector health for admin and engineer users', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Data connectors' })).toBeInTheDocument();
    expect(await screen.findByText('erp')).toBeInTheDocument();
    expect(screen.getByText('mes')).toBeInTheDocument();
    expect(screen.getByText('1,240')).toBeInTheDocument();
    expect(screen.getByText('Source unavailable')).toBeInTheDocument();
  });

  it('does not request protected connector data for guests', async () => {
    useAuthStore.setState({ role: 'GUEST' });
    renderPage();

    await waitFor(() => expect(systemApiMock.getHealth).toHaveBeenCalled());
    expect(systemApiMock.getConnectors).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Data connectors' })).not.toBeInTheDocument();
  });
});
