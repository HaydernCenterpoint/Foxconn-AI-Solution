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
import { useAuthStore } from '../shared/store/auth.store';
import { MachineListPage } from './MachineListPage';

const machinesApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  approve: vi.fn(),
  revoke: vi.fn(),
}));

const linesApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

vi.mock('../features/machines/services/machines.api', () => ({
  machinesApi: machinesApiMock,
}));

vi.mock('../features/production-lines/services/lines.api', () => ({
  linesApi: linesApiMock,
}));

const machines = [
  {
    id: 'machine-1',
    name: 'Press A',
    machineCode: 'MC-01',
    ip: '10.0.0.11',
    status: 'running',
    plcConnected: true,
    clientId: 'press-a-client',
    approvalStatus: 'APPROVED',
    cpuPercent: 24,
    ramPercent: 38,
    uptimeSeconds: 3_600,
    lastHeartbeat: '2026-07-15T01:00:00Z',
    createdAt: '2026-07-01T00:00:00Z',
    lineNames: 'Assembly',
  },
  {
    id: 'machine-2',
    name: 'Welder B',
    machineCode: 'MC-02',
    ip: '10.0.0.12',
    status: 'offline',
    plcConnected: false,
    clientId: 'welder-b-client',
    approvalStatus: 'PENDING',
    cpuPercent: 0,
    ramPercent: 0,
    uptimeSeconds: 0,
    lastHeartbeat: null,
    createdAt: '2026-07-02T00:00:00Z',
    lineNames: 'Welding',
  },
];

function renderPage(path = '/machines') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <MachineListPage />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('MachineListPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testStorage.clear();
    await i18n.changeLanguage('en');
    machinesApiMock.getAll.mockResolvedValue(machines);
    linesApiMock.getAll.mockResolvedValue([
      { id: 'line-1', name: 'Assembly', status: 'active' },
    ]);
    useAuthStore.setState({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      sessionChecked: true,
      welcomePending: false,
      hasSeenWelcome: true,
      sessionMessage: null,
    });
  });

  it('renders the modern equipment inventory without exposing admin controls to viewers', async () => {
    const { container } = renderPage();

    expect(await screen.findByRole('heading', { name: 'Factory Equipment' })).toBeInTheDocument();
    expect(container.querySelector('.machine-list-page')).not.toBeNull();
    expect(await screen.findByText('Press A')).toBeInTheDocument();
    expect(screen.getByText('MC-01')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.11')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'View' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add New Machine' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('preserves approval, revoke, edit, delete, and create controls for administrators', async () => {
    const user = userEvent.setup();
    machinesApiMock.approve.mockResolvedValue({ success: true });
    machinesApiMock.revoke.mockResolvedValue({ success: true });
    useAuthStore.setState({
      token: 'admin-token',
      username: 'admin',
      role: 'ADMIN',
      isAuthenticated: true,
      sessionChecked: true,
    });

    renderPage('/admin/machines');

    expect(await screen.findByRole('button', { name: 'Add New Machine' })).toBeInTheDocument();
    expect(await screen.findByText('Press A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(machinesApiMock.approve).toHaveBeenCalledWith('machine-2'));
    await waitFor(() => expect(machinesApiMock.revoke).toHaveBeenCalledWith('machine-1'));
  });

  it('keeps URL status filtering and machine search behavior', async () => {
    const user = userEvent.setup();

    renderPage('/machines?status=offline');

    expect(await screen.findByText('Welder B')).toBeInTheDocument();
    expect(screen.queryByText('Press A')).not.toBeInTheDocument();

    const statusFilter = screen.getByRole('combobox', { name: 'Filter Status:' });
    expect(statusFilter).toHaveValue('offline');
    await user.selectOptions(statusFilter, '');

    const searchInput = screen.getByRole('searchbox', {
      name: 'Search by machine name, code, or Client ID...',
    });
    await user.type(searchInput, 'MC-01');

    expect(await screen.findByText('Press A')).toBeInTheDocument();
    expect(screen.queryByText('Welder B')).not.toBeInTheDocument();
  });

  it('submits the existing create-machine payload from the redesigned modal', async () => {
    const user = userEvent.setup();
    machinesApiMock.create.mockResolvedValue({ id: 'machine-3' });
    useAuthStore.setState({
      token: 'admin-token',
      username: 'admin',
      role: 'ADMIN',
      isAuthenticated: true,
      sessionChecked: true,
    });

    renderPage('/admin/machines');

    await user.click(await screen.findByRole('button', { name: 'Add New Machine' }));
    expect(screen.getByRole('dialog', { name: 'Create new equipment' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Machine Name *' }), 'Cutter C');
    await user.type(screen.getByRole('textbox', { name: 'Machine Code' }), 'MC-03');
    await user.type(screen.getByRole('textbox', { name: 'IP address' }), '10.0.0.13');
    await user.type(screen.getByRole('textbox', { name: 'Client ID' }), 'cutter-c-client');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Production Line' }), 'line-1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(machinesApiMock.create).toHaveBeenCalledWith({
        name: 'Cutter C',
        machineCode: 'MC-03',
        ip: '10.0.0.13',
        clientId: 'cutter-c-client',
        lineId: 'line-1',
      });
    });
  });
});
