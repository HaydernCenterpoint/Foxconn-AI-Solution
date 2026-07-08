import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Edge, XYPosition } from '@xyflow/react';
import type { Machine } from '../../machines/services/machines.api';
import type { ProductionLine } from '../services/lines.api';
import { getMachineHealthSnapshot } from '../../../shared/lib/monitoring';

export type DiagramNodeType = 'diagramNode';

export interface DiagramNodeData extends Record<string, unknown> {
  equipmentId: string;
  equipmentName: string;
  equipmentCode: string;
  equipmentType?: string;
  ipAddress?: string;
  lineName?: string;
  lineId?: string;
  status: string;
  productionCount?: number;
  temperature?: number;
  pressure?: number;
  speed?: number;
  uptimeSeconds?: number;
  cpuPercent?: number;
  ramPercent?: number;
  isEnabled: boolean;
}

export interface DiagramNode {
  id: string;
  type: DiagramNodeType;
  position: XYPosition;
  data: DiagramNodeData;
}

export type DiagramEdge = Edge;

export type EquipmentType = 'machine' | 'sensor' | 'light';

// Per-line diagram state structure
export interface LineDiagramState {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  usedMachineIds: string[];
  /** Unix timestamp (ms) of the last local edit; used to arbitrate
   *  between localStorage vs backend data when the diagram remounts. */
  lastLocalEditAt?: number;
}

// Schema version for migrations
const CURRENT_SCHEMA_VERSION = 3;

// Legacy v1 state structure for migration
interface LegacyDiagramState {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  selectedLineFilter: string | null;
  selectedTypeFilter: EquipmentType | null;
  usedMachineIds?: string[];
}

// Synchronous-ish storage wrapper - writes immediately so connections
// survive even when users navigate before a debounce would flush.
const syncStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.warn('[DiagramStore] localStorage write failed:', err);
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// Final flush on tab close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    // Nothing pending - sync writes happen immediately now.
  });
  // Some browsers (and React Router's navigate) don't fire beforeunload
  // but DO fire pagehide. Belt and suspenders.
  window.addEventListener('pagehide', () => {
    // synchronous localStorage writes already happened
  });
}

// Migration function: v1 -> v2
function migrateFromV1(state: LegacyDiagramState): PersistedDiagramState {
  return {
    version: CURRENT_SCHEMA_VERSION,
    lineDiagrams: {
      default: {
        nodes: state.nodes || [],
        edges: state.edges || [],
        usedMachineIds: Array.from(state.usedMachineIds || []),
      },
    },
  };
}

export interface PersistedDiagramState {
  version: number;
  lineDiagrams: Record<string, LineDiagramState>;
}

interface DiagramState {
  // Global machine pool (fetched from API)
  allMachines: Machine[];
  allLines: ProductionLine[];

  // Per-line diagram states
  lineDiagrams: Record<string, LineDiagramState>;

  // UI state
  activeLineId: string | null;
  selectedNodeId: string | null;
  selectedLineFilter: string | null;
  selectedTypeFilter: EquipmentType | null;

  // Actions
  setActiveLine: (lineId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  setLineFilter: (lineId: string | null) => void;
  setTypeFilter: (type: EquipmentType | null) => void;
  setAllMachines: (machines: Machine[]) => void;
  setAllLines: (lines: ProductionLine[]) => void;

  // Per-line diagram actions
  addNodeToLine: (lineId: string, machine: Machine, position: XYPosition) => void;
  removeNodeFromLine: (lineId: string, nodeId: string) => void;
  setNodesForLine: (lineId: string, nodes: DiagramNode[]) => void;
  setEdgesForLine: (lineId: string, edges: DiagramEdge[]) => void;
  updateNodeData: (lineId: string, nodeId: string, data: Partial<DiagramNodeData>) => void;
  toggleNodeEnabled: (lineId: string, nodeId: string) => void;
  removeEdgesByHandle: (lineId: string, nodeId: string, handleId: string) => void;

  // Utility actions
  cleanupOrphanedNodes: (lineId: string) => void;
  cleanupAllOrphanedNodes: () => void;

  // Computed
  getAvailableMachinesForLine: (lineId: string) => Machine[];
  getLineDiagram: (lineId: string) => LineDiagramState;
}

function machineToNodeData(machine: Machine): DiagramNodeData {
  const health = getMachineHealthSnapshot(machine);
  return {
    equipmentId: machine.id,
    equipmentName: machine.name,
    equipmentCode: machine.machineCode || machine.clientId || machine.id,
    ipAddress: machine.ip,
    lineName: machine.lineNames,
    status: machine.status,
    productionCount: health.productionQty,
    isEnabled: true,
  };
}

function getMachineLineNames(machine: Machine): string[] {
  return (machine.lineNames || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

export function getEquipmentType(machine: Machine): EquipmentType {
  const name = machine.name.toLowerCase();
  const code = (machine.machineCode || '').toLowerCase();
  const combined = `${name} ${code}`;

  if (combined.includes('sensor') || combined.includes('cảm biến') || combined.includes('温感')) {
    return 'sensor';
  }
  if (combined.includes('light') || combined.includes('đèn') || combined.includes('灯') || combined.includes('signal')) {
    return 'light';
  }
  return 'machine';
}

const defaultLineDiagrams: Record<string, LineDiagramState> = {
  'line-1': {
    nodes: [
      {
        id: 'diagram-line-1-L1-M1',
        type: 'diagramNode',
        position: { x: 50, y: 150 },
        data: { equipmentId: 'L1-M1', equipmentName: 'Trạm cấp liệu 1', equipmentCode: 'MC-01', ipAddress: '192.168.1.10', status: 'running', isEnabled: true, lineId: 'line-1' }
      },
      {
        id: 'diagram-line-1-L1-M2',
        type: 'diagramNode',
        position: { x: 300, y: 150 },
        data: { equipmentId: 'L1-M2', equipmentName: 'Robot gắp 1', equipmentCode: 'MC-02', ipAddress: '192.168.1.11', status: 'running', isEnabled: true, lineId: 'line-1' }
      },
      {
        id: 'diagram-line-1-L1-M3',
        type: 'diagramNode',
        position: { x: 550, y: 150 },
        data: { equipmentId: 'L1-M3', equipmentName: 'Máy khoan 1', equipmentCode: 'MC-03', ipAddress: '192.168.1.12', status: 'idle', isEnabled: true, lineId: 'line-1' }
      },
      {
        id: 'diagram-line-1-L1-M4',
        type: 'diagramNode',
        position: { x: 800, y: 150 },
        data: { equipmentId: 'L1-M4', equipmentName: 'Băng tải 1', equipmentCode: 'MC-04', ipAddress: '192.168.1.13', status: 'running', isEnabled: true, lineId: 'line-1' }
      },
      {
        id: 'diagram-line-1-L1-M5',
        type: 'diagramNode',
        position: { x: 1050, y: 150 },
        data: { equipmentId: 'L1-M5', equipmentName: 'Máy rửa 1', equipmentCode: 'MC-05', ipAddress: '192.168.1.14', status: 'error', isEnabled: true, lineId: 'line-1' }
      }
    ],
    edges: [
      { id: 'edge-line-1-1', source: 'diagram-line-1-L1-M1', target: 'diagram-line-1-L1-M2', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-1-2', source: 'diagram-line-1-L1-M2', target: 'diagram-line-1-L1-M3', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-1-3', source: 'diagram-line-1-L1-M3', target: 'diagram-line-1-L1-M4', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-1-4', source: 'diagram-line-1-L1-M4', target: 'diagram-line-1-L1-M5', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } }
    ],
    usedMachineIds: ['L1-M1', 'L1-M2', 'L1-M3', 'L1-M4', 'L1-M5']
  },
  'line-2': {
    nodes: [
      {
        id: 'diagram-line-2-L2-M1',
        type: 'diagramNode',
        position: { x: 50, y: 150 },
        data: { equipmentId: 'L2-M1', equipmentName: 'Trạm cấp liệu 2', equipmentCode: 'MC-06', ipAddress: '192.168.2.10', status: 'running', isEnabled: true, lineId: 'line-2' }
      },
      {
        id: 'diagram-line-2-L2-M2',
        type: 'diagramNode',
        position: { x: 300, y: 150 },
        data: { equipmentId: 'L2-M2', equipmentName: 'Robot gắp 2', equipmentCode: 'MC-07', ipAddress: '192.168.2.11', status: 'running', isEnabled: true, lineId: 'line-2' }
      },
      {
        id: 'diagram-line-2-L2-M3',
        type: 'diagramNode',
        position: { x: 550, y: 150 },
        data: { equipmentId: 'L2-M3', equipmentName: 'Máy hàn 1', equipmentCode: 'MC-08', ipAddress: '192.168.2.12', status: 'running', isEnabled: true, lineId: 'line-2' }
      },
      {
        id: 'diagram-line-2-L2-M4',
        type: 'diagramNode',
        position: { x: 800, y: 150 },
        data: { equipmentId: 'L2-M4', equipmentName: 'Băng tải 2', equipmentCode: 'MC-09', ipAddress: '192.168.2.13', status: 'idle', isEnabled: true, lineId: 'line-2' }
      },
      {
        id: 'diagram-line-2-L2-M5',
        type: 'diagramNode',
        position: { x: 1050, y: 150 },
        data: { equipmentId: 'L2-M5', equipmentName: 'Máy ép 1', equipmentCode: 'MC-10', ipAddress: '192.168.2.14', status: 'maintenance', isEnabled: true, lineId: 'line-2' }
      }
    ],
    edges: [
      { id: 'edge-line-2-1', source: 'diagram-line-2-L2-M1', target: 'diagram-line-2-L2-M2', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-2-2', source: 'diagram-line-2-L2-M2', target: 'diagram-line-2-L2-M3', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-2-3', source: 'diagram-line-2-L2-M3', target: 'diagram-line-2-L2-M4', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-2-4', source: 'diagram-line-2-L2-M4', target: 'diagram-line-2-L2-M5', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } }
    ],
    usedMachineIds: ['L2-M1', 'L2-M2', 'L2-M3', 'L2-M4', 'L2-M5']
  },
  'line-3': {
    nodes: [
      {
        id: 'diagram-line-3-L3-M1',
        type: 'diagramNode',
        position: { x: 50, y: 150 },
        data: { equipmentId: 'L3-M1', equipmentName: 'Trạm cấp liệu 3', equipmentCode: 'MC-11', ipAddress: '192.168.3.10', status: 'running', isEnabled: true, lineId: 'line-3' }
      },
      {
        id: 'diagram-line-3-L3-M2',
        type: 'diagramNode',
        position: { x: 300, y: 150 },
        data: { equipmentId: 'L3-M2', equipmentName: 'Robot gắp 3', equipmentCode: 'MC-12', ipAddress: '192.168.3.11', status: 'error', isEnabled: true, lineId: 'line-3' }
      },
      {
        id: 'diagram-line-3-L3-M3',
        type: 'diagramNode',
        position: { x: 550, y: 150 },
        data: { equipmentId: 'L3-M3', equipmentName: 'Máy khoan 2', equipmentCode: 'MC-13', ipAddress: '192.168.3.12', status: 'running', isEnabled: true, lineId: 'line-3' }
      },
      {
        id: 'diagram-line-3-L3-M4',
        type: 'diagramNode',
        position: { x: 800, y: 150 },
        data: { equipmentId: 'L3-M4', equipmentName: 'Băng tải 3', equipmentCode: 'MC-14', ipAddress: '192.168.3.13', status: 'running', isEnabled: true, lineId: 'line-3' }
      },
      {
        id: 'diagram-line-3-L3-M5',
        type: 'diagramNode',
        position: { x: 1050, y: 150 },
        data: { equipmentId: 'L3-M5', equipmentName: 'Máy dán 1', equipmentCode: 'MC-15', ipAddress: '192.168.3.14', status: 'stopped', isEnabled: true, lineId: 'line-3' }
      }
    ],
    edges: [
      { id: 'edge-line-3-1', source: 'diagram-line-3-L3-M1', target: 'diagram-line-3-L3-M2', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-3-2', source: 'diagram-line-3-L3-M2', target: 'diagram-line-3-L3-M3', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-3-3', source: 'diagram-line-3-L3-M3', target: 'diagram-line-3-L3-M4', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } },
      { id: 'edge-line-3-4', source: 'diagram-line-3-L3-M4', target: 'diagram-line-3-L3-M5', type: 'animated', style: { stroke: '#06b6d4', strokeWidth: 2.25 } }
    ],
    usedMachineIds: ['L3-M1', 'L3-M2', 'L3-M3', 'L3-M4', 'L3-M5']
  }
};

// Initialize empty line diagram state
function createEmptyLineState(): LineDiagramState {
  return {
    nodes: [],
    edges: [],
    usedMachineIds: [],
  };
}

const EMPTY_LINE_STATE: LineDiagramState = createEmptyLineState();

export const useDiagramStore = create<DiagramState>()(
  persist(
    (set, get) => ({
      // Global machine pool
      allMachines: [],
      allLines: [],

      // Per-line diagram states (keyed by lineId)
      lineDiagrams: {},

      // UI state
      activeLineId: null,
      selectedNodeId: null,
      selectedLineFilter: null,
      selectedTypeFilter: null,

      // Actions
      setActiveLine: (lineId) => set({ activeLineId: lineId }),

      selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

      setLineFilter: (lineId) => set({ selectedLineFilter: lineId }),

      setTypeFilter: (type) => set({ selectedTypeFilter: type }),

      setAllMachines: (machines) => {
        set({ allMachines: machines });
        // Clean orphaned nodes after machine list refresh
        get().cleanupAllOrphanedNodes();
      },

      setAllLines: (lines) => set({ allLines: lines }),

      // Per-line diagram actions
      addNodeToLine: (lineId, machine, position) => {
        const { lineDiagrams, allMachines } = get();
        const lineState = lineDiagrams[lineId] || createEmptyLineState();

        // Check if machine is already used in this line
        if (lineState.usedMachineIds.includes(machine.id)) return;

        // Check if machine exists in global pool
        const machineExists = allMachines.some(m => m.id === machine.id);
        if (!machineExists) return;

        const newNode: DiagramNode = {
          id: `diagram-${lineId}-${machine.id}-${Date.now()}`,
          type: 'diagramNode',
          position,
          data: { ...machineToNodeData(machine), lineId },
        };

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes: [...lineState.nodes, newNode],
              usedMachineIds: [...lineState.usedMachineIds, machine.id],
              lastLocalEditAt: Date.now(),
            },
          },
        });
      },

      removeNodeFromLine: (lineId, nodeId) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId];
        if (!lineState) return;

        const node = lineState.nodes.find(n => n.id === nodeId);
        if (!node) return;

        const machineId = node.data.equipmentId;

        // Remove edges connected to this node
        const filteredEdges = lineState.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        );

        // Remove machine from used list
        const filteredUsedIds = lineState.usedMachineIds.filter(id => id !== machineId);

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes: lineState.nodes.filter(n => n.id !== nodeId),
              edges: filteredEdges,
              usedMachineIds: filteredUsedIds,
              lastLocalEditAt: Date.now(),
            },
          },
          selectedNodeId: null,
        });
      },

      setNodesForLine: (lineId, nodes) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId] || createEmptyLineState();
        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes,
              lastLocalEditAt: Date.now(),
            },
          },
        });
      },

      setEdgesForLine: (lineId, edges) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId] || createEmptyLineState();
        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              edges,
              lastLocalEditAt: Date.now(),
            },
          },
        });
      },

      updateNodeData: (lineId, nodeId, data) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId];
        if (!lineState) return;

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes: lineState.nodes.map((node) =>
                node.id === nodeId
                  ? { ...node, data: { ...node.data, ...data } }
                  : node
              ),
            },
          },
        });
      },

      toggleNodeEnabled: (lineId, nodeId) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId];
        if (!lineState) return;

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes: lineState.nodes.map((node) =>
                node.id === nodeId
                  ? { ...node, data: { ...node.data, isEnabled: !node.data.isEnabled } }
                  : node
              ),
            },
          },
        });
      },

      removeEdgesByHandle: (lineId, nodeId, handleId) => {
        const { lineDiagrams } = get();
        const lineState = lineDiagrams[lineId];
        if (!lineState) return;

        const filtered = lineState.edges.filter(
          (e) => !(
            (e.source === nodeId && (e.sourceHandle ?? '') === handleId) ||
            (e.target === nodeId && (e.targetHandle ?? '') === handleId)
          ),
        );

        if (filtered.length === lineState.edges.length) return;

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: { ...lineState, edges: filtered },
          },
        });
      },

      // Orphan cleanup
      cleanupOrphanedNodes: (lineId) => {
        const { lineDiagrams, allMachines } = get();
        const lineState = lineDiagrams[lineId];
        if (!lineState) return;

        const validMachineIds = new Set(allMachines.map(m => m.id));

        const validNodes = lineState.nodes.filter(
          n => validMachineIds.has(n.data.equipmentId)
        );

        const validNodeIds = new Set(validNodes.map(n => n.id));
        const validMachineIdsForLine = new Set(validNodes.map(n => n.data.equipmentId));

        set({
          lineDiagrams: {
            ...lineDiagrams,
            [lineId]: {
              ...lineState,
              nodes: validNodes,
              edges: lineState.edges.filter(
                e => validNodeIds.has(e.source) && validNodeIds.has(e.target)
              ),
              usedMachineIds: Array.from(validMachineIdsForLine),
            },
          },
        });
      },

      cleanupAllOrphanedNodes: () => {
        const { lineDiagrams } = get();
        Object.keys(lineDiagrams).forEach(lineId => {
          get().cleanupOrphanedNodes(lineId);
        });
      },

      // Computed
      getAvailableMachinesForLine: (lineId) => {
        const { allMachines, allLines, selectedLineFilter, selectedTypeFilter } = get();
        const lineState = get().lineDiagrams[lineId];
        const activeLine = allLines.find((line) => line.id === lineId);

        // Get machines used in this specific line
        const lineUsedIds = lineState?.usedMachineIds || [];

        return allMachines.filter((machine) => {
          // Exclude machines already in this line's diagram
          if (lineUsedIds.includes(machine.id)) return false;

          const machineLines = getMachineLineNames(machine);

          if (activeLine && !machineLines.includes(activeLine.name)) return false;

          // Filter by line (global filter)
          if (selectedLineFilter) {
            if (!machineLines.includes(selectedLineFilter)) return false;
          }

          // Filter by type
          if (selectedTypeFilter) {
            const machineType = getEquipmentType(machine);
            if (machineType !== selectedTypeFilter) return false;
          }

          return true;
        });
      },

      getLineDiagram: (lineId) => {
        const { lineDiagrams } = get();
        const diagram = lineDiagrams[lineId];
        if (diagram && (diagram.nodes.length > 0 || diagram.edges.length > 0)) {
          return diagram;
        }
        return defaultLineDiagrams[lineId] || EMPTY_LINE_STATE;
      },
    }),
    {
      name: 'fii-diagram-state-v3',
      storage: createJSONStorage(() => syncStorage),
      partialize: (state) => {
        // Only persist lineDiagrams, version, and UI state
        return {
          version: CURRENT_SCHEMA_VERSION,
          lineDiagrams: state.lineDiagrams,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Check if this is legacy v1 state (has nodes/edges but no lineDiagrams)
        const legacyState = state as unknown as LegacyDiagramState & { lineDiagrams?: Record<string, LineDiagramState> };
        if (legacyState.nodes && legacyState.edges && !legacyState.lineDiagrams) {
          // Migrate from v1 to v2
          const migrated = migrateFromV1(legacyState);
          state.lineDiagrams = migrated.lineDiagrams;
          console.log('[DiagramStore] Migrated from v1 to v2 schema');
        }

        // v2 -> v3: ensure every line has a lastLocalEditAt timestamp
        if (state.lineDiagrams) {
          const now = Date.now();
          for (const lineId of Object.keys(state.lineDiagrams)) {
            const ls = state.lineDiagrams[lineId];
            if (ls && typeof ls.lastLocalEditAt !== 'number') {
              ls.lastLocalEditAt = now;
            }
          }
        }
      },
      version: CURRENT_SCHEMA_VERSION,
      migrate: (persistedState: any, version: number) => {
        // v2 -> v3: backfill lastLocalEditAt for any existing entry
        if (version < 3 && persistedState?.lineDiagrams) {
          const now = Date.now();
          for (const lineId of Object.keys(persistedState.lineDiagrams)) {
            const ls = persistedState.lineDiagrams[lineId];
            if (ls && typeof ls.lastLocalEditAt !== 'number') {
              ls.lastLocalEditAt = now;
            }
          }
        }
        return persistedState as PersistedDiagramState;
      },
    }
  )
);
