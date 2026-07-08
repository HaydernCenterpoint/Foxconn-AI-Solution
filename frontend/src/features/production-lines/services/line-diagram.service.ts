import type { Edge, Node, Viewport } from '@xyflow/react';

export interface EquipmentNodeData extends Record<string, unknown> {
  equipmentId: string;
  equipmentCode: string;
  equipmentName: string;
  equipmentType: string;
  ipAddress?: string;
  port?: number;
  protocol?: string;
  operatingStatus: string;
  connectionStatus: string;
  productionCount?: number;
  lastUpdatedAt?: string;
  label: string;
  note?: string;
}

export interface LineDiagram {
  id: string;
  lineId: string;
  name: string;
  version: number;
  viewport: Viewport;
  nodes: Node<EquipmentNodeData>[];
  edges: Edge[];
  updatedAt: string;
  updatedBy?: string;
  storageMode: 'local';
}

const STORAGE_PREFIX = 'fii-line-diagram';

function getStorageKey(lineId: string) {
  return `${STORAGE_PREFIX}:${lineId}`;
}

export const lineDiagramService = {
  async load(lineId: string): Promise<LineDiagram | null> {
    const raw = window.localStorage.getItem(getStorageKey(lineId));
    if (!raw) return null;

    try {
      return JSON.parse(raw) as LineDiagram;
    } catch {
      return null;
    }
  },

  async save(diagram: Omit<LineDiagram, 'updatedAt' | 'storageMode'>): Promise<LineDiagram> {
    const persisted: LineDiagram = {
      ...diagram,
      updatedAt: new Date().toISOString(),
      storageMode: 'local',
    };
    window.localStorage.setItem(getStorageKey(diagram.lineId), JSON.stringify(persisted));
    return persisted;
  },

  async remove(lineId: string) {
    window.localStorage.removeItem(getStorageKey(lineId));
  },
};

