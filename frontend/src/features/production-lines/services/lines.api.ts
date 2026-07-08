import { api } from '../../../shared/services/apiClient';
import type { AddMachineToLineRequest, LineRequest, ProductionLine } from '../../../shared/types/domain';
import {
  normalizeActionResult,
  normalizeMachineList,
  normalizeProductionLine,
  normalizeProductionLineList,
} from '../../../shared/services/normalize';

export interface DiagramLayoutData {
  nodes: any[];
  edges: any[];
}

export interface DiagramLayout {
  lineId: string;
  layoutData: DiagramLayoutData;
  updatedAt?: string;
  updatedBy?: string;
}

export const linesApi = {
  getAll: () =>
    api.get('/production-lines').then((r) => normalizeProductionLineList(r.data)),

  create: (data: LineRequest) =>
    api.post('/production-lines', data).then((r) => normalizeProductionLine(r.data)),

  update: (id: string, data: LineRequest) =>
    api.put(`/production-lines/${id}`, data).then((r) => normalizeActionResult(r.data)),

  delete: (id: string) =>
    api.delete(`/production-lines/${id}`).then((r) => normalizeActionResult(r.data)),

  getMachines: (lineId: string) =>
    api.get(`/production-lines/${lineId}/machines`).then((r) => normalizeMachineList(r.data)),

  addMachine: (lineId: string, data: AddMachineToLineRequest) =>
    api.post(`/production-lines/${lineId}/machines`, data).then((r) => normalizeActionResult(r.data)),

  removeMachine: (lineId: string, machineId: string) =>
    api.delete(`/production-lines/${lineId}/machines/${machineId}`).then((r) => normalizeActionResult(r.data)),

  updateMachineOrder: (lineId: string, machineId: string, sequenceOrder: number) =>
    api.put(`/production-lines/${lineId}/machines/${machineId}/order`, { sequenceOrder }).then((r) => normalizeActionResult(r.data)),

  getDiagramLayout: (lineId: string): Promise<DiagramLayout> =>
    api.get(`/production-lines/${lineId}/diagram-layout`).then((r) => r.data),

  saveDiagramLayout: (lineId: string, layoutData: DiagramLayoutData) =>
    api.put(`/production-lines/${lineId}/diagram-layout`, { layoutData }).then((r) => normalizeActionResult(r.data)),
};

export type { AddMachineToLineRequest, LineRequest, ProductionLine };
