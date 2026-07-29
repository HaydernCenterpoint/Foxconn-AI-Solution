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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../app/i18n';
import type { Machine } from '../../machines/services/machines.api';
import { useUiStore } from '../../../shared/store/ui.store';
import { DiagramEditor } from './DiagramEditor';

const linesApiMock = vi.hoisted(() => ({
  getMachines: vi.fn(),
  getAll: vi.fn(),
  addMachine: vi.fn(),
  removeMachine: vi.fn(),
  updateMachineOrder: vi.fn(),
  update: vi.fn(),
}));

const machinesApiMock = vi.hoisted(() => ({
  getAll: vi.fn(),
}));

const permissionsMock = vi.hoisted(() => ({
  value: {
    canEdit: true,
    canCreate: true,
  },
}));

vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));
vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn(), fromTo: vi.fn() } }));
vi.mock('../services/lines.api', () => ({ linesApi: linesApiMock }));
vi.mock('../../machines/services/machines.api', () => ({ machinesApi: machinesApiMock }));
vi.mock('../../../shared/hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock.value,
}));

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');

  type MockNode = {
    id: string;
    data: {
      name: string;
    };
  };

  type MockFlowProps = {
    nodes: MockNode[];
    edges: Array<{ id: string }>;
    onNodeClick?: (event: MouseEvent<HTMLButtonElement>, node: MockNode) => void;
    onPaneClick?: () => void;
    children?: ReactNode;
  };

  const ReactFlow = ({ nodes, edges, onNodeClick, onPaneClick, children }: MockFlowProps) => (
    <div data-testid="react-flow" data-edge-count={edges.length}>
      <div data-testid="flow-pane" onClick={onPaneClick} />
      {nodes.map((node) => (
        <button key={node.id} type="button" onClick={(event) => onNodeClick?.(event, node)}>
          {node.data.name}
        </button>
      ))}
      {children}
    </div>
  );

  return {
    ...actual,
    Background: () => null,
    Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    ReactFlow,
  };
});

const stationA: Machine = {
  id: 'm1',
  name: 'Station A',
  machineCode: 'STA-01',
  ip: '10.10.0.11',
  status: 'running',
  plcConnected: true,
  approvalStatus: 'APPROVED',
  cpuPercent: 42,
  ramPercent: 58,
  uptimeSeconds: 7_200,
  lastHeartbeat: '2026-07-29T02:34:17.000Z',
  lastPlcData: { productionCount: 120 },
  sequenceOrder: 1,
};

const stationB: Machine = {
  id: 'm2',
  name: 'Station B',
  machineCode: 'STB-02',
  ip: '10.10.0.12',
  status: 'offline',
  plcConnected: false,
  approvalStatus: 'APPROVED',
  cpuPercent: 0,
  ramPercent: 0,
  uptimeSeconds: 0,
  lastPlcData: { productionCount: 0 },
  sequenceOrder: 2,
};

const stationC: Machine = {
  id: 'm3',
  name: 'Station C',
  machineCode: 'STC-03',
  ip: '10.10.0.13',
  status: 'idle',
  plcConnected: true,
  approvalStatus: 'APPROVED',
  cpuPercent: 21,
  ramPercent: 33,
  uptimeSeconds: 900,
  lastPlcData: { productionCount: 7 },
  sequenceOrder: 3,
};

const line = {
  id: 'line-1',
  name: 'MKZ',
  status: 'active' as const,
  description: JSON.stringify({
    m1: { prev: null, next: 'm2' },
    m2: { prev: 'm1', next: null },
  }),
};

function renderEditor(props: Partial<ComponentProps<typeof DiagramEditor>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <DiagramEditor lineId="line-1" {...props} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('DiagramEditor workspace', () => {
  beforeEach(async () => {
    testStorage.clear();
    await i18n.changeLanguage('en');
    permissionsMock.value = { canEdit: true, canCreate: true };
    linesApiMock.getMachines.mockReset().mockResolvedValue([stationA, stationB]);
    linesApiMock.getAll.mockReset().mockResolvedValue([line]);
    linesApiMock.addMachine.mockReset().mockResolvedValue({ success: true });
    linesApiMock.removeMachine.mockReset().mockResolvedValue({ success: true });
    linesApiMock.updateMachineOrder.mockReset().mockResolvedValue({ success: true });
    linesApiMock.update.mockReset().mockResolvedValue({ success: true });
    machinesApiMock.getAll.mockReset().mockResolvedValue([stationA, stationB, stationC]);
    useUiStore.setState({ addToast: vi.fn(), toasts: [], notifications: [] });
  });

  it('shows a compact operational summary above the flow canvas', async () => {
    renderEditor();
    await screen.findByRole('heading', { name: 'MKZ' });

    const summary = screen.getByLabelText('Line summary');
    expect(within(summary).getByText('Stations').nextElementSibling).toHaveTextContent('2');
    expect(within(summary).getByText('PLC connected').nextElementSibling).toHaveTextContent('1/2');
    expect(within(summary).getByText('Connections').nextElementSibling).toHaveTextContent('1');
    expect(within(summary).getByText('Reported output').nextElementSibling).toHaveTextContent('120');
  });

  it('opens complete station details when a canvas node is selected', async () => {
    renderEditor();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Station A' }));

    const inspector = screen.getByLabelText('Station details');
    expect(within(inspector).getByRole('heading', { name: 'Station A' })).toBeInTheDocument();
    expect(within(inspector).getByText('10.10.0.11')).toBeInTheDocument();
    expect(within(inspector).getByText('42%')).toBeInTheDocument();
    expect(within(inspector).getByText('58%')).toBeInTheDocument();
    expect(within(inspector).getByText('Outgoing').nextElementSibling).toHaveTextContent('1');
  });

  it('adds a station to the draft and restores the saved flow on cancel', async () => {
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'MKZ' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit flow' }));
    await screen.findByRole('button', { name: 'Save' });
    await user.click(await screen.findByRole('button', { name: /Available stations/ }));
    const stationLibraryItem = (await screen.findByText('Station C')).closest('.line-flow-library__item');
    expect(stationLibraryItem).not.toBeNull();
    await user.click(within(stationLibraryItem as HTMLElement).getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('button', { name: 'Station C' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Station C' })).not.toBeInTheDocument();
    expect(linesApiMock.addMachine).not.toHaveBeenCalled();
  });

  it('serializes connection edits when the flow is saved', async () => {
    renderEditor();
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'MKZ' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit flow' }));
    await screen.findByRole('button', { name: 'Save' });
    await user.click(screen.getByRole('button', { name: 'Station A' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Station B' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(linesApiMock.update).toHaveBeenCalledWith('line-1', {
      name: 'MKZ',
      description: JSON.stringify({
        m1: { prev: null, next: null },
        m2: { prev: null, next: null },
      }),
    }));
  });

  it('keeps edit controls hidden in read-only mode', async () => {
    renderEditor({ readOnly: true });
    await screen.findByRole('heading', { name: 'MKZ' });

    expect(screen.queryByRole('button', { name: 'Edit flow' })).not.toBeInTheDocument();
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
  });
});
