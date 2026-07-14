import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { ArrowLeft, Check, ChevronDown, ChevronUp, Link2, Maximize2, Minus, Network, Plus, Save, Trash2 } from 'lucide-react';
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

  return machines.map((machine) => {
    const level = levels[machine.id] ?? 0;
    const machinesAtLevel = [...(groupedByLevel.get(level) ?? [])].sort((left, right) => (left.sequenceOrder ?? 1) - (right.sequenceOrder ?? 1));
    const row = machinesAtLevel.findIndex((candidate) => candidate.id === machine.id);
    const productionCount = machine.lastPlcData?.productionCount;
    return {
      id: machine.id,
      type: 'machineNode',
      position: { x: 56 + level * 300, y: 56 + Math.max(0, row) * 190 },
      data: {
        id: machine.id,
        name: machine.name,
        machineCode: machine.machineCode,
        status: machine.status,
        ip: machine.ip,
        productionCount: typeof productionCount === 'number' && Number.isFinite(productionCount) ? productionCount : undefined,
        plcConnected: machine.plcConnected,
      },
    };
  });
}

function formatOutput(machine: Machine | undefined, locale: string) {
  const count = machine?.lastPlcData?.productionCount;
  return typeof count === 'number' && Number.isFinite(count) ? count.toLocaleString(locale) : '—';
}

export function DiagramEditor({ lineId, readOnly = false, onClose, hideSidebar = false }: DiagramEditorProps) {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canEdit, canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);
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

  const selectedMachine = useMemo(() => {
    if (!selectedNodeId) return undefined;
    return lineMachines.find((machine) => machine.id === selectedNodeId)
      ?? (allMachinesQuery.data ?? []).find((machine) => machine.id === selectedNodeId);
  }, [allMachinesQuery.data, lineMachines, selectedNodeId]);

  const availableMachines = useMemo(() => {
    const usedIds = new Set(displayNodes.map((node) => node.id));
    return (allMachinesQuery.data ?? []).filter((machine) => !usedIds.has(machine.id));
  }, [allMachinesQuery.data, displayNodes]);

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
        position: { x: 56 + (currentNodes.length % 3) * 300, y: 56 + Math.floor(currentNodes.length / 3) * 190 },
        data: {
          id: machine.id,
          name: machine.name,
          machineCode: machine.machineCode,
          status: machine.status,
          ip: machine.ip,
          productionCount: typeof productionCount === 'number' && Number.isFinite(productionCount) ? productionCount : undefined,
          plcConnected: machine.plcConnected,
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

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      {onClose && <Button variant="secondary" size="sm" startIcon={<ArrowLeft size={16} aria-hidden="true" />} onClick={onClose}>{t('common.actions.back', { defaultValue: 'Back' })}</Button>}
      {isEditing ? (
        <>
          <Button variant="secondary" size="sm" disabled={saveMutation.isPending} onClick={cancelEditing}>{t('common.actions.cancel', { defaultValue: 'Cancel' })}</Button>
          <Button size="sm" loading={saveMutation.isPending} startIcon={<Save size={16} aria-hidden="true" />} onClick={() => saveMutation.mutate()}>{t('flowDesigner.toolbar.save', { defaultValue: 'Save flow' })}</Button>
        </>
      ) : canConfigure ? (
        <Button size="sm" startIcon={<Network size={16} aria-hidden="true" />} onClick={startEditing}>{t('flowDesigner.edit', { defaultValue: 'Edit flow' })}</Button>
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
    <div className="space-y-4">
      <PageHeader
        eyebrow={t('flowDesigner.eyebrow', { defaultValue: 'Line flow configuration' })}
        title={currentLine ? tDynamic(currentLine.name) : t('flowDesigner.title', { defaultValue: 'Production line flow' })}
        description={isEditing
          ? t('flowDesigner.editDescription', { defaultValue: 'Edit station membership and connections. The saved flow is serialized in the production-line description.' })
          : t('flowDesigner.viewDescription', { defaultValue: 'Inspect station connections and their latest machine-record values.' })}
        actions={headerActions}
      />

      {isEditing && (
        <Surface variant="quiet" padding="sm" className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <Link2 size={16} aria-hidden="true" />
          <span>{t('flowDesigner.editHint', { defaultValue: 'Connect station handles on the canvas, or use the selected station panel. Flow sequence is saved; display positions are recalculated from saved connections.' })}</span>
        </Surface>
      )}

      <div className={`grid gap-4 ${hideSidebar ? '' : 'xl:grid-cols-[minmax(0,1fr)_20rem]'}`}>
        <Surface variant="raised" padding="none" className="relative min-h-[32rem] overflow-hidden">
          {displayNodes.length === 0 ? (
            <DataState
              kind="empty"
              title={t('flowDesigner.empty.title', { defaultValue: 'No stations assigned to this line' })}
              description={canAddRemove && isEditing
                ? t('flowDesigner.empty.editDescription', { defaultValue: 'Use the station library below to add an available machine.' })
                : t('flowDesigner.empty.description', { defaultValue: 'No station assignments were returned for this production line.' })}
            />
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
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.35}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              className="bg-surface-container-lowest"
            >
              <Background color="var(--color-outline)" gap={18} size={1} />
              <Panel position="bottom-right" className="m-3 flex gap-2">
                <Button variant="secondary" size="sm" aria-label={t('common.actions.zoomOut', { defaultValue: 'Zoom out' })} title={t('common.actions.zoomOut', { defaultValue: 'Zoom out' })} onClick={() => flowInstance?.zoomOut()}><Minus size={15} aria-hidden="true" /></Button>
                <Button variant="secondary" size="sm" aria-label={t('common.actions.fitView', { defaultValue: 'Fit flow' })} title={t('common.actions.fitView', { defaultValue: 'Fit flow' })} onClick={() => flowInstance?.fitView({ padding: 0.2, maxZoom: 1 })}><Maximize2 size={15} aria-hidden="true" /></Button>
                <Button variant="secondary" size="sm" aria-label={t('common.actions.zoomIn', { defaultValue: 'Zoom in' })} title={t('common.actions.zoomIn', { defaultValue: 'Zoom in' })} onClick={() => flowInstance?.zoomIn()}><Plus size={15} aria-hidden="true" /></Button>
              </Panel>
            </ReactFlow>
          )}
        </Surface>

        {!hideSidebar && (
          <aside className="space-y-4">
            <Surface variant="raised" padding="md" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="title-small text-text-primary">{selectedMachine ? tDynamic(selectedMachine.name) : t('flowDesigner.inspectorTitle', { defaultValue: 'Station details' })}</h2>
                  <p className="mt-1 text-xs text-text-muted">{selectedMachine ? selectedMachine.machineCode || selectedMachine.id : t('flowDesigner.inspectorDescription', { defaultValue: 'Select a station in the flow to inspect it.' })}</p>
                </div>
                {selectedMachine && <StatusBadge status={selectedMachine.status} size="sm" />}
              </div>

              {selectedMachine ? (
                <>
                  <dl className="space-y-3 border-y border-border py-3 text-sm">
                    <div className="flex items-center justify-between gap-3"><dt className="text-text-muted">IP</dt><dd className="font-mono text-text-primary">{selectedMachine.ip || '—'}</dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-text-muted">{t('machines.table.plcConnected', { defaultValue: 'PLC connection' })}</dt><dd><Badge variant={selectedMachine.plcConnected ? 'success' : 'offline'} size="sm" dot>{selectedMachine.plcConnected ? t('machines.plcConnected', { defaultValue: 'Connected' }) : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}</Badge></dd></div>
                    <div className="flex items-center justify-between gap-3"><dt className="text-text-muted">{t('machines.productionCount', { defaultValue: 'Reported output' })}</dt><dd className="font-mono text-text-primary">{formatOutput(selectedMachine, locale)}</dd></div>
                  </dl>

                  {isEditing && canConfigure && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3"><h3 className="label-small text-text-secondary">{t('flowDesigner.nextStations', { defaultValue: 'Next stations' })}</h3><Badge variant="neutral" size="sm">{connectionTargets.size}</Badge></div>
                      <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                        {displayNodes.filter((node) => node.id !== selectedMachine.id).map((node) => {
                          const targetMachine = lineMachines.find((machine) => machine.id === node.id) ?? (allMachinesQuery.data ?? []).find((machine) => machine.id === node.id);
                          const isConnected = connectionTargets.has(node.id);
                          return (
                            <label key={node.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-3">
                              <input type="checkbox" checked={isConnected} onChange={(event) => toggleConnection(selectedMachine.id, node.id, event.target.checked)} />
                              <span className="min-w-0 flex-1 truncate text-text-primary">{targetMachine ? tDynamic(targetMachine.name) : node.data.name}</span>
                              {isConnected && <Check size={14} className="text-primary" aria-hidden="true" />}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isEditing && canAddRemove && (
                    <Button variant="danger" size="sm" startIcon={<Trash2 size={15} aria-hidden="true" />} onClick={() => setRemoveTargetId(selectedMachine.id)}>
                      {t('flowDesigner.removeStation', { defaultValue: 'Remove from line' })}
                    </Button>
                  )}
                </>
              ) : null}
            </Surface>
          </aside>
        )}
      </div>

      {isEditing && canAddRemove && (
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <button type="button" className="panel-header w-full text-left" onClick={() => setLibraryOpen((open) => !open)} aria-expanded={libraryOpen}>
            <span>
              <span className="title-small text-text-primary">{t('flowDesigner.stationLibrary', { defaultValue: 'Available stations' })}</span>
              <span className="mt-1 block text-xs text-text-muted">{t('flowDesigner.stationLibraryDescription', { defaultValue: 'Only administrators can add or remove station assignments.' })}</span>
            </span>
            {libraryOpen ? <ChevronUp size={18} className="text-text-secondary" aria-hidden="true" /> : <ChevronDown size={18} className="text-text-secondary" aria-hidden="true" />}
          </button>
          {libraryOpen && (
            <div className="p-4">
              {allMachinesQuery.isLoading ? (
                <DataState kind="loading" title={t('flowDesigner.loadingAvailable', { defaultValue: 'Loading available stations' })} />
              ) : allMachinesQuery.isError ? (
                <DataState kind="error" title={t('flowDesigner.availableError', { defaultValue: 'Available stations are unavailable' })} action={<Button variant="secondary" size="sm" onClick={() => void allMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>} />
              ) : availableMachines.length === 0 ? (
                <DataState kind="empty" title={t('flowDesigner.noAvailable', { defaultValue: 'No unassigned stations available' })} />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {availableMachines.map((machine) => (
                    <Surface key={machine.id} variant="quiet" padding="sm" className="flex items-center justify-between gap-3">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-text-primary">{tDynamic(machine.name)}</p><p className="mt-1 truncate font-mono text-xs text-text-muted">{machine.machineCode || machine.id}</p></div>
                      <Button size="sm" startIcon={<Plus size={14} aria-hidden="true" />} onClick={() => addMachineToDraft(machine)}>{t('common.actions.add', { defaultValue: 'Add' })}</Button>
                    </Surface>
                  ))}
                </div>
              )}
            </div>
          )}
        </Surface>
      )}

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
