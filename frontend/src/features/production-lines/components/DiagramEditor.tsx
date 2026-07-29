import { useCallback, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Cpu,
  GitBranch,
  Link2,
  Maximize2,
  Minus,
  MousePointer2,
  Network,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { linesApi } from '../services/lines.api';
import { machinesApi, type Machine } from '../../machines/services/machines.api';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { DataState } from '../../../shared/components/ui/DataState';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { Surface } from '../../../shared/components/ui/Surface';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import { useUiStore } from '../../../shared/store/ui.store';
import MachineNode, { type MachineNodeData } from './nodes/MachineNode';

interface DiagramEditorProps {
  lineId: string;
  readOnly?: boolean;
  onClose?: () => void;
  hideSidebar?: boolean;
}

type DiagramNode = Node<MachineNodeData, 'machineNode'>;
type DiagramEdge = Edge;

type SerializedConnection = {
  prev: string | null;
  next: string | null;
};

const nodeTypes: NodeTypes = { machineNode: MachineNode };

gsap.registerPlugin(useGSAP);

function createEdge(source: string, target: string): DiagramEdge {
  return {
    id: `edge-${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-primary)' },
    style: { stroke: 'var(--color-primary)', strokeWidth: 2 },
  };
}

function parseConnections(description: string | undefined, machineIds: Set<string>): DiagramEdge[] | null {
  if (!description?.trim().startsWith('{')) return null;

  try {
    const parsed: unknown = JSON.parse(description);
    if (!parsed || typeof parsed !== 'object') return null;

    const records = parsed as Record<string, unknown>;
    const sourceTargets = new Map<string, Set<string>>();
    const addConnection = (source: unknown, target: unknown) => {
      if (typeof source !== 'string' || typeof target !== 'string') return;
      if (!machineIds.has(source) || !machineIds.has(target) || source === target) return;
      const targets = sourceTargets.get(source) ?? new Set<string>();
      targets.add(target);
      sourceTargets.set(source, targets);
    };

    if (Array.isArray(records.edges)) {
      records.edges.forEach((edge) => {
        if (edge && typeof edge === 'object') {
          const record = edge as Record<string, unknown>;
          addConnection(record.source, record.target);
        }
      });
    } else {
      Object.entries(records).forEach(([source, value]) => {
        const next = value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>).next
          : value;
        if (typeof next !== 'string') return;
        next.split(',').map((target) => target.trim()).filter(Boolean).forEach((target) => addConnection(source, target));
      });
    }

    return Array.from(sourceTargets.entries()).flatMap(([source, targets]) => Array.from(targets).map((target) => createEdge(source, target)));
  } catch {
    return null;
  }
}

function fallbackConnections(machines: Machine[]): DiagramEdge[] {
  const sorted = [...machines].sort((left, right) => (left.sequenceOrder ?? 0) - (right.sequenceOrder ?? 0));
  return sorted.slice(0, -1).map((machine, index) => createEdge(machine.id, sorted[index + 1].id));
}

function serializeConnections(machineIds: string[], edges: DiagramEdge[]) {
  const serialized: Record<string, SerializedConnection> = Object.fromEntries(
    machineIds.map((machineId) => [machineId, { prev: null, next: null }]),
  );

  edges.forEach((edge) => {
    if (!serialized[edge.source] || !serialized[edge.target]) return;
    const sourceNext = serialized[edge.source].next ? serialized[edge.source].next!.split(',') : [];
    const targetPrev = serialized[edge.target].prev ? serialized[edge.target].prev!.split(',') : [];
    if (!sourceNext.includes(edge.target)) sourceNext.push(edge.target);
    if (!targetPrev.includes(edge.source)) targetPrev.push(edge.source);
    serialized[edge.source].next = sourceNext.join(',') || null;
    serialized[edge.target].prev = targetPrev.join(',') || null;
  });

  return JSON.stringify(serialized);
}

function calculateSequenceOrders(machineIds: string[], edges: DiagramEdge[], machines: Machine[]) {
  const ids = new Set(machineIds);
  const outgoing = new Map(machineIds.map((id) => [id, [] as string[]]));
  const inDegree = new Map(machineIds.map((id) => [id, 0]));

  edges.forEach((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) return;
    const targets = outgoing.get(edge.source)!;
    if (!targets.includes(edge.target)) {
      targets.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  });

  const sequenceById = new Map(machines.map((machine) => [machine.id, machine.sequenceOrder ?? 1]));
  const compareIds = (left: string, right: string) => (sequenceById.get(left) ?? 1) - (sequenceById.get(right) ?? 1) || left.localeCompare(right);
  const queue = machineIds.filter((id) => inDegree.get(id) === 0).sort(compareIds);
  const result: Record<string, number> = {};
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const order = result[id] ?? 1;
    result[id] = order;
    outgoing.get(id)?.forEach((target) => {
      result[target] = Math.max(result[target] ?? 1, order + 1);
      inDegree.set(target, (inDegree.get(target) ?? 1) - 1);
      if (inDegree.get(target) === 0) queue.push(target);
    });
    queue.sort(compareIds);
  }

  machineIds.filter((id) => !visited.has(id)).sort(compareIds).forEach((id, index) => {
    result[id] = result[id] ?? Math.max(1, index + 1);
  });

  return result;
}

function buildNodes(machines: Machine[], edges: DiagramEdge[]): DiagramNode[] {
  const ids = machines.map((machine) => machine.id);
  const idSet = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  const inDegree = new Map(ids.map((id) => [id, 0]));

  edges.forEach((edge) => {
    if (!idSet.has(edge.source) || !idSet.has(edge.target) || edge.source === edge.target) return;
    const targets = outgoing.get(edge.source)!;
    if (!targets.includes(edge.target)) {
      targets.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  });

  const bySequence = (left: string, right: string) => {
    const leftMachine = machines.find((machine) => machine.id === left);
    const rightMachine = machines.find((machine) => machine.id === right);
    return (leftMachine?.sequenceOrder ?? 1) - (rightMachine?.sequenceOrder ?? 1) || left.localeCompare(right);
  };
  const queue = ids.filter((id) => inDegree.get(id) === 0).sort(bySequence);
  const levels: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    outgoing.get(id)?.forEach((target) => {
      levels[target] = Math.max(levels[target] ?? 0, (levels[id] ?? 0) + 1);
      inDegree.set(target, (inDegree.get(target) ?? 1) - 1);
      if (inDegree.get(target) === 0) queue.push(target);
    });
    queue.sort(bySequence);
  }

  ids.filter((id) => !visited.has(id)).sort(bySequence).forEach((id) => {
    levels[id] = Math.max(0, (machines.find((machine) => machine.id === id)?.sequenceOrder ?? 1) - 1);
  });

  const groupedByLevel = new Map<number, Machine[]>();
  machines.forEach((machine) => {
    const level = levels[machine.id] ?? 0;
    const machinesAtLevel = groupedByLevel.get(level) ?? [];
    machinesAtLevel.push(machine);
    groupedByLevel.set(level, machinesAtLevel);
  });

  return machines.map((machine, index) => {
    const level = levels[machine.id] ?? 0;
    const machinesAtLevel = [...(groupedByLevel.get(level) ?? [])].sort((left, right) => (left.sequenceOrder ?? 1) - (right.sequenceOrder ?? 1));
    const row = machinesAtLevel.findIndex((candidate) => candidate.id === machine.id);
    const productionCount = machine.lastPlcData?.productionCount;
    return {
      id: machine.id,
      type: 'machineNode',
      position: { x: 56 + level * 330, y: 56 + Math.max(0, row) * 190 },
      data: {
        id: machine.id,
        name: machine.name,
        machineCode: machine.machineCode,
        status: machine.status,
        ip: machine.ip,
        productionCount: typeof productionCount === 'number' && Number.isFinite(productionCount) ? productionCount : undefined,
        plcConnected: machine.plcConnected,
        sequenceOrder: machine.sequenceOrder ?? index + 1,
      },
    };
  });
}

function formatOutput(machine: Machine | undefined, locale: string) {
  const count = machine?.lastPlcData?.productionCount;
  return typeof count === 'number' && Number.isFinite(count) ? count.toLocaleString(locale) : '—';
}

function formatHeartbeat(machine: Machine | undefined, locale: string) {
  if (!machine?.lastHeartbeat) return '—';
  const heartbeat = new Date(machine.lastHeartbeat);
  if (Number.isNaN(heartbeat.getTime())) return '—';
  return heartbeat.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function DiagramEditor({ lineId, readOnly = false, onClose, hideSidebar = false }: DiagramEditorProps) {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canEdit, canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<DiagramNode, DiagramEdge> | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<DiagramNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DiagramEdge>([]);

  const locale = i18n.language === 'zh' || i18n.language === 'zh-CN'
    ? 'zh-CN'
    : i18n.language === 'en'
      ? 'en-US'
      : 'vi-VN';
  const canConfigure = !readOnly && canEdit;
  const canAddRemove = !readOnly && canCreate;

  const lineMachinesQuery = useQuery({
    queryKey: ['line-machines-diagram', lineId],
    queryFn: () => linesApi.getMachines(lineId),
    refetchInterval: 2_000,
  });
  const linesQuery = useQuery({
    queryKey: ['lines-all-diagram'],
    queryFn: linesApi.getAll,
  });
  const allMachinesQuery = useQuery({
    queryKey: ['machines-all-selector'],
    queryFn: machinesApi.getAll,
    enabled: canAddRemove && isEditing,
  });

  const currentLine = linesQuery.data?.find((line) => line.id === lineId);
  const lineMachines = useMemo(() => lineMachinesQuery.data ?? [], [lineMachinesQuery.data]);
  const persistedEdges = useMemo(() => {
    const parsed = parseConnections(currentLine?.description, new Set(lineMachines.map((machine) => machine.id)));
    return parsed ?? fallbackConnections(lineMachines);
  }, [currentLine?.description, lineMachines]);
  const persistedNodes = useMemo(() => buildNodes(lineMachines, persistedEdges), [lineMachines, persistedEdges]);
  const displayNodes = isEditing ? nodes : persistedNodes;
  const displayEdges = isEditing ? edges : persistedEdges;

  const machineById = useMemo(
    () => new Map([...(allMachinesQuery.data ?? []), ...lineMachines].map((machine) => [machine.id, machine])),
    [allMachinesQuery.data, lineMachines],
  );

  const selectedMachine = useMemo(() => {
    if (!selectedNodeId) return undefined;
    return machineById.get(selectedNodeId);
  }, [machineById, selectedNodeId]);

  const availableMachines = useMemo(() => {
    const usedIds = new Set(displayNodes.map((node) => node.id));
    return (allMachinesQuery.data ?? []).filter((machine) => !usedIds.has(machine.id));
  }, [allMachinesQuery.data, displayNodes]);

  const connectedStationCount = displayNodes.filter((node) => node.data.plcConnected).length;
  const reportedOutput = displayNodes.reduce(
    (total, node) => total + (typeof node.data.productionCount === 'number' ? node.data.productionCount : 0),
    0,
  );
  const incomingConnections = selectedNodeId
    ? displayEdges.filter((edge) => edge.target === selectedNodeId)
    : [];
  const outgoingConnections = selectedNodeId
    ? displayEdges.filter((edge) => edge.source === selectedNodeId)
    : [];

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(
      '.line-flow-workspace__reveal',
      { opacity: 0, y: 14 },
      { duration: 0.48, ease: 'power3.out', opacity: 1, stagger: 0.06, y: 0 },
    );
  }, { scope: workspaceRef, dependencies: [lineId, lineMachinesQuery.isLoading] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentLine) throw new Error('The production line is unavailable.');
      const machineIds = nodes.map((node) => node.id);
      const machineIdSet = new Set(machineIds);
      const validEdges = edges.filter((edge) => machineIdSet.has(edge.source) && machineIdSet.has(edge.target) && edge.source !== edge.target);
      const addedIds = machineIds.filter((id) => !lineMachines.some((machine) => machine.id === id));
      const removedIds = lineMachines.filter((machine) => !machineIdSet.has(machine.id)).map((machine) => machine.id);
      const knownMachines = [...lineMachines, ...(allMachinesQuery.data ?? [])];
      const sequenceOrders = calculateSequenceOrders(machineIds, validEdges, knownMachines);

      for (const machineId of addedIds) {
        await linesApi.addMachine(lineId, { machineId, sequenceOrder: sequenceOrders[machineId] ?? 1 });
      }
      for (const machineId of removedIds) {
        await linesApi.removeMachine(lineId, machineId);
      }
      for (const machineId of machineIds) {
        const original = lineMachines.find((machine) => machine.id === machineId);
        const nextOrder = sequenceOrders[machineId] ?? 1;
        if (!original || original.sequenceOrder !== nextOrder) {
          await linesApi.updateMachineOrder(lineId, machineId, nextOrder);
        }
      }

      await linesApi.update(currentLine.id, {
        name: currentLine.name,
        description: serializeConnections(machineIds, validEdges),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['line-machines-diagram', lineId] }),
        queryClient.invalidateQueries({ queryKey: ['line-machines', lineId] }),
        queryClient.invalidateQueries({ queryKey: ['lines-all-diagram'] }),
        queryClient.invalidateQueries({ queryKey: ['lines', 'list'] }),
      ]);
      addToast('success', t('flowDesigner.saveSuccess', { defaultValue: 'Line flow saved' }));
      setIsEditing(false);
      setLibraryOpen(false);
    },
    onError: () => {
      addToast('error', t('flowDesigner.saveError', { defaultValue: 'Unable to save the line flow. Your draft remains open.' }));
    },
  });

  const startEditing = () => {
    if (!canConfigure) return;
    setNodes(persistedNodes);
    setEdges(persistedEdges);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (saveMutation.isPending) return;
    setIsEditing(false);
    setLibraryOpen(false);
  };

  const handleNodesChange = useCallback((changes: NodeChange<DiagramNode>[]) => {
    if (!isEditing) return;
    onNodesChange(changes.filter((change) => change.type !== 'remove'));
  }, [isEditing, onNodesChange]);

  const handleEdgesChange = useCallback((changes: EdgeChange<DiagramEdge>[]) => {
    if (!isEditing) return;
    onEdgesChange(changes);
  }, [isEditing, onEdgesChange]);

  const handleConnect = useCallback((connection: Connection) => {
    if (!isEditing || !connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((currentEdges) => {
      if (currentEdges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return currentEdges;
      return [...currentEdges, createEdge(connection.source!, connection.target!)];
    });
  }, [isEditing, setEdges]);

  const toggleConnection = (source: string, target: string, shouldConnect: boolean) => {
    setEdges((currentEdges) => {
      if (shouldConnect) {
        if (currentEdges.some((edge) => edge.source === source && edge.target === target)) return currentEdges;
        return [...currentEdges, createEdge(source, target)];
      }
      return currentEdges.filter((edge) => !(edge.source === source && edge.target === target));
    });
  };

  const addMachineToDraft = (machine: Machine) => {
    if (!isEditing || nodes.some((node) => node.id === machine.id)) return;
    const productionCount = machine.lastPlcData?.productionCount;
    setNodes((currentNodes) => [
      ...currentNodes,
      {
        id: machine.id,
        type: 'machineNode',
        position: { x: 56 + (currentNodes.length % 3) * 330, y: 56 + Math.floor(currentNodes.length / 3) * 190 },
        data: {
          id: machine.id,
          name: machine.name,
          machineCode: machine.machineCode,
          status: machine.status,
          ip: machine.ip,
          productionCount: typeof productionCount === 'number' && Number.isFinite(productionCount) ? productionCount : undefined,
          plcConnected: machine.plcConnected,
          sequenceOrder: currentNodes.reduce(
            (highestOrder, node) => Math.max(highestOrder, Number(node.data.sequenceOrder) || 0),
            0,
          ) + 1,
        },
      },
    ]);
    setSelectedNodeId(machine.id);
  };

  const removeMachineFromDraft = () => {
    if (!removeTargetId) return;
    setNodes((currentNodes) => currentNodes.filter((node) => node.id !== removeTargetId));
    setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== removeTargetId && edge.target !== removeTargetId));
    setSelectedNodeId((current) => current === removeTargetId ? null : current);
    setRemoveTargetId(null);
  };

  const connectionTargets = new Set(displayEdges.filter((edge) => edge.source === selectedNodeId).map((edge) => edge.target));
  const selectedSequence = displayNodes.find((node) => node.id === selectedNodeId)?.data.sequenceOrder;
  const lineStatus = currentLine?.status ?? 'active';
  const lineStatusLabel = t(`flowDesigner.workspace.status.${lineStatus}`, {
    defaultValue: lineStatus === 'maintenance' ? 'Maintenance' : lineStatus === 'inactive' ? 'Inactive' : 'Active',
  });

  const headerActions = (
    <div className="line-flow-workspace__actions">
      {onClose && <Button variant="secondary" size="sm" startIcon={<ArrowLeft size={16} aria-hidden="true" />} onClick={onClose}>{t('common.actions.back', { defaultValue: 'Back' })}</Button>}
      {isEditing ? (
        <>
          <Button variant="secondary" size="sm" disabled={saveMutation.isPending} onClick={cancelEditing}>{t('common.actions.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button size="sm" loading={saveMutation.isPending} startIcon={<Save size={16} aria-hidden="true" />} onClick={() => saveMutation.mutate()}>{t('flowDesigner.toolbar.save', { defaultValue: 'Save flow' })}</Button>
        </>
      ) : canConfigure ? (
        <Button
          size="sm"
          disabled={lineMachinesQuery.isLoading || linesQuery.isLoading || !currentLine}
          startIcon={<Network size={16} aria-hidden="true" />}
          onClick={startEditing}
        >
          {t('flowDesigner.edit', { defaultValue: 'Edit flow' })}
        </Button>
      ) : null}
    </div>
  );

  if (lineMachinesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('flowDesigner.loadingTitle', { defaultValue: 'Production line flow' })} actions={headerActions} />
        <Surface variant="raised"><DataState kind="loading" title={t('flowDesigner.loading', { defaultValue: 'Loading line stations' })} /></Surface>
      </div>
    );
  }

  if (lineMachinesQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('flowDesigner.errorTitle', { defaultValue: 'Production line flow' })} actions={headerActions} />
        <Surface variant="raised"><DataState kind="error" title={t('flowDesigner.error', { defaultValue: 'Line stations are unavailable' })} description={t('flowDesigner.errorDescription', { defaultValue: 'The production-line service could not be reached.' })} action={<Button variant="secondary" size="sm" onClick={() => void lineMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>} /></Surface>
      </div>
    );
  }

  return (
    <div ref={workspaceRef} className="line-flow-workspace">
      <header className="line-flow-workspace__header line-flow-workspace__reveal">
        <div className="line-flow-workspace__context">
          <div className="line-flow-workspace__kicker">
            <span>{t('flowDesigner.eyebrow', { defaultValue: 'Line flow configuration' })}</span>
            <span aria-hidden="true">/</span>
            <Badge
              variant={lineStatus === 'maintenance' ? 'maintenance' : lineStatus === 'inactive' ? 'offline' : 'success'}
              size="sm"
              dot
            >
              {lineStatusLabel}
            </Badge>
          </div>
          <div className="line-flow-workspace__title-row">
            <h1>{currentLine ? tDynamic(currentLine.name) : t('flowDesigner.title', { defaultValue: 'Production line flow' })}</h1>
            <span className="line-flow-workspace__refresh">
              <RefreshCw size={13} aria-hidden="true" />
              {t('flowDesigner.workspace.liveRefresh', { defaultValue: 'Live · 2s' })}
            </span>
          </div>
          <p>
            {isEditing
              ? t('flowDesigner.editDescription', { defaultValue: 'Edit station membership and connections, then save the new sequence.' })
              : t('flowDesigner.viewDescription', { defaultValue: 'Inspect station connections and their latest machine-record values.' })}
          </p>
        </div>
        {headerActions}
      </header>

      <section
        className="line-flow-workspace__metrics line-flow-workspace__reveal"
        aria-label={t('flowDesigner.workspace.summary', { defaultValue: 'Line summary' })}
      >
        <article className="line-flow-metric">
          <span className="line-flow-metric__icon"><Network size={17} aria-hidden="true" /></span>
          <span className="line-flow-metric__copy">
            <span>{t('flowDesigner.workspace.stations', { defaultValue: 'Stations' })}</span>
            <strong>{displayNodes.length}</strong>
          </span>
        </article>
        <article className="line-flow-metric">
          <span className="line-flow-metric__icon line-flow-metric__icon--positive"><Cpu size={17} aria-hidden="true" /></span>
          <span className="line-flow-metric__copy">
            <span>{t('flowDesigner.workspace.plcOnline', { defaultValue: 'PLC connected' })}</span>
            <strong>{connectedStationCount}<small>/{displayNodes.length}</small></strong>
          </span>
        </article>
        <article className="line-flow-metric">
          <span className="line-flow-metric__icon"><GitBranch size={17} aria-hidden="true" /></span>
          <span className="line-flow-metric__copy">
            <span>{t('flowDesigner.workspace.connections', { defaultValue: 'Connections' })}</span>
            <strong>{displayEdges.length}</strong>
          </span>
        </article>
        <article className="line-flow-metric">
          <span className="line-flow-metric__icon line-flow-metric__icon--accent"><Activity size={17} aria-hidden="true" /></span>
          <span className="line-flow-metric__copy">
            <span>{t('flowDesigner.workspace.reportedOutput', { defaultValue: 'Reported output' })}</span>
            <strong>{reportedOutput.toLocaleString(locale)}</strong>
          </span>
        </article>
      </section>

      <div className={`line-flow-workspace__body line-flow-workspace__reveal ${hideSidebar ? 'line-flow-workspace__body--wide' : ''}`}>
        <section className="line-flow-canvas" aria-labelledby="line-flow-canvas-title">
          <div className="line-flow-canvas__header">
            <div className="line-flow-canvas__heading">
              <span className="line-flow-canvas__heading-icon"><CircleDot size={15} aria-hidden="true" /></span>
              <span>
                <h2 id="line-flow-canvas-title">{t('flowDesigner.workspace.canvasTitle', { defaultValue: 'Line topology' })}</h2>
                <p>{t('flowDesigner.workspace.canvasDescription', { defaultValue: 'Select a station to inspect live signals and sequence.' })}</p>
              </span>
            </div>
            <span className={`line-flow-canvas__mode ${isEditing ? 'line-flow-canvas__mode--editing' : ''}`}>
              <span aria-hidden="true" />
              {isEditing
                ? t('flowDesigner.workspace.editMode', { defaultValue: 'Editing flow' })
                : t('flowDesigner.workspace.viewMode', { defaultValue: 'Monitoring' })}
            </span>
          </div>

          {isEditing && (
            <div className="line-flow-canvas__hint">
              <Link2 size={15} aria-hidden="true" />
              <span>{t('flowDesigner.editHint', { defaultValue: 'Connect station handles on the canvas or use the selected station panel. Positions are recalculated from saved connections.' })}</span>
            </div>
          )}

          <div className="line-flow-canvas__stage">
            {displayNodes.length === 0 ? (
              <div className="line-flow-canvas__empty">
                <span><Network size={24} aria-hidden="true" /></span>
                <h3>{t('flowDesigner.empty.title', { defaultValue: 'No stations assigned to this line' })}</h3>
                <p>{canAddRemove && isEditing
                  ? t('flowDesigner.empty.editDescription', { defaultValue: 'Open the station library to add an available machine.' })
                  : t('flowDesigner.empty.description', { defaultValue: 'No station assignments were returned for this production line.' })}</p>
                {canAddRemove && isEditing && (
                  <Button size="sm" startIcon={<Plus size={14} aria-hidden="true" />} onClick={() => setLibraryOpen(true)}>
                    {t('flowDesigner.workspace.openLibrary', { defaultValue: 'Open station library' })}
                  </Button>
                )}
              </div>
            ) : (
              <ReactFlow<DiagramNode, DiagramEdge>
                nodes={displayNodes}
                edges={displayEdges}
                onNodesChange={handleNodesChange}
                onEdgesChange={handleEdgesChange}
                onConnect={handleConnect}
                onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
                onPaneClick={() => setSelectedNodeId(null)}
                onInit={setFlowInstance}
                nodeTypes={nodeTypes}
                nodesDraggable={false}
                nodesConnectable={isEditing}
                edgesFocusable={isEditing}
                fitView
                fitViewOptions={{ padding: 0.28, maxZoom: 0.95 }}
                minZoom={0.35}
                maxZoom={1.5}
                proOptions={{ hideAttribution: true }}
                className="line-flow-canvas__flow"
              >
                <Background color="#3b4c68" gap={22} size={1} />
                <Panel position="bottom-right" className="line-flow-canvas__controls">
                  <Button variant="secondary" size="sm" aria-label={t('common.actions.zoomOut', { defaultValue: 'Zoom out' })} title={t('common.actions.zoomOut', { defaultValue: 'Zoom out' })} onClick={() => flowInstance?.zoomOut()}><Minus size={15} aria-hidden="true" /></Button>
                  <Button variant="secondary" size="sm" aria-label={t('common.actions.fitView', { defaultValue: 'Fit flow' })} title={t('common.actions.fitView', { defaultValue: 'Fit flow' })} onClick={() => flowInstance?.fitView({ padding: 0.28, maxZoom: 0.95 })}><Maximize2 size={15} aria-hidden="true" /></Button>
                  <Button variant="secondary" size="sm" aria-label={t('common.actions.zoomIn', { defaultValue: 'Zoom in' })} title={t('common.actions.zoomIn', { defaultValue: 'Zoom in' })} onClick={() => flowInstance?.zoomIn()}><Plus size={15} aria-hidden="true" /></Button>
                </Panel>
              </ReactFlow>
            )}
          </div>
        </section>

        {!hideSidebar && (
          <aside className="line-flow-inspector" aria-label={t('flowDesigner.inspectorTitle', { defaultValue: 'Station details' })}>
            <div className="line-flow-inspector__header">
              <div>
                <span className="line-flow-inspector__eyebrow">
                  {selectedMachine
                    ? t('flowDesigner.workspace.selectedStation', { defaultValue: 'Selected station' })
                    : t('flowDesigner.workspace.inspector', { defaultValue: 'Inspector' })}
                </span>
                <h2>{selectedMachine ? tDynamic(selectedMachine.name) : t('flowDesigner.inspectorTitle', { defaultValue: 'Station details' })}</h2>
                <p>{selectedMachine ? selectedMachine.machineCode || selectedMachine.id : t('flowDesigner.inspectorDescription', { defaultValue: 'Select a station in the flow to inspect it.' })}</p>
              </div>
              {selectedMachine && <StatusBadge status={selectedMachine.status} size="sm" />}
            </div>

            {selectedMachine ? (
              <div className="line-flow-inspector__content">
                <section className="line-flow-inspector__section">
                  <div className="line-flow-inspector__section-heading">
                    <h3>{t('flowDesigner.workspace.liveData', { defaultValue: 'Live machine data' })}</h3>
                    {selectedSequence && <Badge variant="neutral" size="sm">#{String(selectedSequence).padStart(2, '0')}</Badge>}
                  </div>
                  <dl className="line-flow-inspector__data-grid">
                    <div>
                      <dt>IP</dt>
                      <dd className="line-flow-inspector__mono">{selectedMachine.ip || '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('machines.table.plcConnected', { defaultValue: 'PLC connection' })}</dt>
                      <dd>
                        <Badge variant={selectedMachine.plcConnected ? 'success' : 'offline'} size="sm" dot>
                          {selectedMachine.plcConnected
                            ? t('machines.plcConnected', { defaultValue: 'Connected' })
                            : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}
                        </Badge>
                      </dd>
                    </div>
                    <div>
                      <dt>{t('machines.productionCount', { defaultValue: 'Reported output' })}</dt>
                      <dd className="line-flow-inspector__value">{formatOutput(selectedMachine, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('machines.detail.lastHeartbeat', { defaultValue: 'Last received' })}</dt>
                      <dd className="line-flow-inspector__mono">{formatHeartbeat(selectedMachine, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('machines.detail.cpu', { defaultValue: 'CPU' })}</dt>
                      <dd className="line-flow-inspector__value">{Number.isFinite(selectedMachine.cpuPercent) ? `${Math.round(selectedMachine.cpuPercent)}%` : '—'}</dd>
                    </div>
                    <div>
                      <dt>{t('machines.detail.ram', { defaultValue: 'RAM' })}</dt>
                      <dd className="line-flow-inspector__value">{Number.isFinite(selectedMachine.ramPercent) ? `${Math.round(selectedMachine.ramPercent)}%` : '—'}</dd>
                    </div>
                  </dl>
                </section>

                <section className="line-flow-inspector__section">
                  <div className="line-flow-inspector__section-heading">
                    <h3>{t('flowDesigner.workspace.connectionMap', { defaultValue: 'Connection map' })}</h3>
                    <Badge variant="neutral" size="sm">{incomingConnections.length + outgoingConnections.length}</Badge>
                  </div>
                  <div className="line-flow-inspector__connection-grid">
                    <div>
                      <span>{t('flowDesigner.workspace.incoming', { defaultValue: 'Incoming' })}</span>
                      <strong>{incomingConnections.length}</strong>
                      <small>{incomingConnections.map((edge) => {
                        const machine = machineById.get(edge.source);
                        return machine ? tDynamic(machine.name) : edge.source;
                      }).join(', ') || '—'}</small>
                    </div>
                    <div>
                      <span>{t('flowDesigner.workspace.outgoing', { defaultValue: 'Outgoing' })}</span>
                      <strong>{outgoingConnections.length}</strong>
                      <small>{outgoingConnections.map((edge) => {
                        const machine = machineById.get(edge.target);
                        return machine ? tDynamic(machine.name) : edge.target;
                      }).join(', ') || '—'}</small>
                    </div>
                  </div>
                </section>

                {isEditing && canConfigure && (
                  <section className="line-flow-inspector__section">
                    <div className="line-flow-inspector__section-heading">
                      <h3>{t('flowDesigner.nextStations', { defaultValue: 'Next stations' })}</h3>
                      <Badge variant="neutral" size="sm">{connectionTargets.size}</Badge>
                    </div>
                    <div className="line-flow-inspector__checklist">
                      {displayNodes.filter((node) => node.id !== selectedMachine.id).map((node) => {
                        const targetMachine = machineById.get(node.id);
                        const isConnected = connectionTargets.has(node.id);
                        return (
                          <label key={node.id}>
                            <input type="checkbox" checked={isConnected} onChange={(event) => toggleConnection(selectedMachine.id, node.id, event.target.checked)} />
                            <span>{targetMachine ? tDynamic(targetMachine.name) : node.data.name}</span>
                            {isConnected && <Check size={14} aria-hidden="true" />}
                          </label>
                        );
                      })}
                    </div>
                  </section>
                )}

                {isEditing && canAddRemove && (
                  <Button
                    variant="danger"
                    size="sm"
                    className="line-flow-inspector__remove"
                    startIcon={<Trash2 size={15} aria-hidden="true" />}
                    onClick={() => setRemoveTargetId(selectedMachine.id)}
                  >
                    {t('flowDesigner.removeStation', { defaultValue: 'Remove from line' })}
                  </Button>
                )}
              </div>
            ) : (
              <div className="line-flow-inspector__empty">
                <span><MousePointer2 size={22} aria-hidden="true" /></span>
                <h3>{t('flowDesigner.workspace.selectTitle', { defaultValue: 'Choose a station' })}</h3>
                <p>{t('flowDesigner.workspace.selectDescription', { defaultValue: 'Select any station card on the canvas to see connectivity, output and runtime details.' })}</p>
                <ol>
                  <li><span>1</span>{t('flowDesigner.workspace.selectStep', { defaultValue: 'Select a station on the canvas' })}</li>
                  <li><span>2</span>{t('flowDesigner.workspace.inspectStep', { defaultValue: 'Review signals and connections here' })}</li>
                </ol>
              </div>
            )}

            {isEditing && canAddRemove && (
              <section className="line-flow-library">
                <button
                  type="button"
                  className="line-flow-library__toggle"
                  onClick={() => setLibraryOpen((open) => !open)}
                  aria-expanded={libraryOpen}
                  aria-controls="line-flow-station-library"
                >
                  <span>
                    <strong>{t('flowDesigner.stationLibrary', { defaultValue: 'Available stations' })}</strong>
                    <small>{t('flowDesigner.workspace.libraryCount', { count: availableMachines.length, defaultValue: '{{count}} ready to add' })}</small>
                  </span>
                  {libraryOpen ? <ChevronUp size={17} aria-hidden="true" /> : <ChevronDown size={17} aria-hidden="true" />}
                </button>
                {libraryOpen && (
                  <div id="line-flow-station-library" className="line-flow-library__content">
                    {allMachinesQuery.isLoading ? (
                      <DataState kind="loading" title={t('flowDesigner.loadingAvailable', { defaultValue: 'Loading available stations' })} />
                    ) : allMachinesQuery.isError ? (
                      <DataState kind="error" title={t('flowDesigner.availableError', { defaultValue: 'Available stations are unavailable' })} action={<Button variant="secondary" size="sm" onClick={() => void allMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>} />
                    ) : availableMachines.length === 0 ? (
                      <DataState kind="empty" title={t('flowDesigner.noAvailable', { defaultValue: 'No unassigned stations available' })} />
                    ) : (
                      <div className="line-flow-library__list">
                        {availableMachines.map((machine) => (
                          <div key={machine.id} className="line-flow-library__item">
                            <span>
                              <strong>{tDynamic(machine.name)}</strong>
                              <small>{machine.machineCode || machine.id}</small>
                            </span>
                            <Button size="sm" startIcon={<Plus size={14} aria-hidden="true" />} onClick={() => addMachineToDraft(machine)}>
                              {t('common.actions.add', { defaultValue: 'Add' })}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removeTargetId)}
        title={t('flowDesigner.removeConfirmTitle', { defaultValue: 'Remove station from line?' })}
        description={t('flowDesigner.removeConfirmDescription', { defaultValue: 'The station and its draft connections will be removed when the flow is saved.' })}
        confirmLabel={t('common.actions.remove', { defaultValue: 'Remove' })}
        confirmTone="danger"
        onCancel={() => setRemoveTargetId(null)}
        onConfirm={removeMachineFromDraft}
      />
    </div>
  );
}

export default DiagramEditor;
