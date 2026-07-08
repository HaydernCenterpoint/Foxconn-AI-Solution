import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Node,
  type Edge,
  type Connection,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';

export type NodeType = 'machine' | 'sensor' | 'process';
export type EdgeType = 'animated' | 'smoothstep' | 'button';

export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  description?: string;
  ipAddress?: string;
  status?: string;
  equipmentId?: string;
  equipmentCode?: string;
  lineId?: string;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<{ edgeType?: EdgeType; animated?: boolean }>;

export interface LibraryItem {
  id: string;
  name: string;
  code: string;
  ip: string;
  lineId: string;
  status: string;
}

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  libraryItems: LibraryItem[];
  usedLibraryIds: Set<string>;
  selectedLineFilter: string;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;

  addNodeFromLibrary: (item: LibraryItem, position: { x: number; y: number }) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;

  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;

  setSelectedLineFilter: (lineId: string) => void;

  clearAll: () => void;
  loadFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;
  fitView: () => void;
  fitViewTrigger: number;
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      libraryItems: [],
      usedLibraryIds: new Set<string>(),
      selectedLineFilter: 'all',
      fitViewTrigger: 0,

      onNodesChange: (changes) => {
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes),
        }));
      },

      onEdgesChange: (changes) => {
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
        }));
      },

      onConnect: (connection) => {
        set((state) => ({
          edges: addEdge(
            {
              ...connection,
              type: 'button',
              animated: true,
            },
            state.edges,
          ),
        }));
      },

      addNodeFromLibrary: (item, position) => {
        const id = `node-${crypto.randomUUID()}`;

        const newNode: FlowNode = {
          id,
          type: 'equipmentNode',
          position,
          data: {
            label: item.name,
            nodeType: 'machine' as NodeType,
            description: item.code,
            ipAddress: item.ip,
            status: item.status,
            equipmentId: item.id,
            equipmentCode: item.code,
            lineId: item.lineId,
          },
        };

        set((state) => {
          const newUsedIds = new Set(state.usedLibraryIds);
          newUsedIds.add(item.id);
          return {
            nodes: [...state.nodes, newNode],
            usedLibraryIds: newUsedIds,
          };
        });
      },

      removeNode: (id) => {
        set((state) => {
          const node = state.nodes.find((n) => n.id === id);
          const equipmentId = node?.data?.equipmentId;

          const newUsedIds = new Set(state.usedLibraryIds);
          if (equipmentId) {
            newUsedIds.delete(equipmentId);
          }

          return {
            nodes: state.nodes.filter((n) => n.id !== id),
            edges: state.edges.filter(
              (edge) => edge.source !== id && edge.target !== id,
            ),
            selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
            usedLibraryIds: newUsedIds,
          };
        });
      },

      removeEdge: (id) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id),
          selectedEdgeId: state.selectedEdgeId === id ? null : state.selectedEdgeId,
        }));
      },

      setSelectedNode: (id) => {
        set({ selectedNodeId: id, selectedEdgeId: null });
      },

      setSelectedEdge: (id) => {
        set({ selectedEdgeId: id, selectedNodeId: null });
      },

      setSelectedLineFilter: (lineId) => {
        set({ selectedLineFilter: lineId });
      },

      clearAll: () => {
        set({
          nodes: [],
          edges: [],
          selectedNodeId: null,
          selectedEdgeId: null,
          usedLibraryIds: new Set<string>(),
        });
      },

      loadFlow: (nodes, edges) => {
        const usedIds = new Set(nodes.map((n) => n.data?.equipmentId).filter((id): id is string => Boolean(id)));
        set({ nodes, edges, usedLibraryIds: usedIds });
      },

      fitView: () => {
        set((state) => ({ fitViewTrigger: state.fitViewTrigger + 1 }));
      },
    }),
    {
      name: 'fii-flow-designer',
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        libraryItems: state.libraryItems,
        selectedLineFilter: state.selectedLineFilter,
      }),
    },
  ),
);
