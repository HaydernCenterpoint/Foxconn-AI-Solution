import { api } from '../../../shared/services/apiClient';
import type { ApprovalStatus, MachineStatus, PlcTelemetry } from '../../../shared/types/domain';
import {
  normalizeActionResult,
  normalizeHourlyProductionList,
  normalizeMachine,
  normalizeMachineList,
} from '../../../shared/services/normalize';

export interface Machine {
  id: string;
  name: string;
  machineCode?: string;
  ip?: string;
  status: MachineStatus;
  plcConnected?: boolean;
  clientId?: string;
  approvalStatus: ApprovalStatus;
  cpuPercent: number;
  ramPercent: number;
  uptimeSeconds: number;
  lastHeartbeat?: string;
  lastPlcData?: PlcTelemetry;
  sequenceOrder?: number;
  createdAt?: string;
  lineNames?: string;
}

export interface HourlyProduction {
  prodDate: string;
  prodHour: number;
  producedQtyStart: number;
  producedQtyEnd: number;
  hourlyQty: number;
  plcRunTimeStart: number;
  plcRunTimeEnd: number;
  avgCpu: number;
  avgRam: number;
  receivedAt: string;
}

export interface MachineRequest {
  name: string;
  machineCode?: string;
  ip?: string;
  clientId?: string;
  lineId?: string;
}

export interface MachineHealth {
  machineId: string;
  score: number;
  band: 'healthy' | 'warning' | 'critical';
  calculatedAt: string;
  factors: {
    availability: number;
    alarmScore: number;
    performance: number;
    activeAlarms: number;
    recentEvents: number;
    cpu: number;
    ram: number;
  };
}

export const machinesApi = {
  getAll: () =>
    api.get('/machines').then((r) => normalizeMachineList(r.data)),

  getById: (id: string) =>
    api.get(`/machines/${id}`).then((r) => normalizeMachine(r.data)),

  create: (data: MachineRequest) =>
    api.post('/machines', data).then((r) => normalizeMachine(r.data)),

  update: (id: string, data: MachineRequest) =>
    api.put(`/machines/${id}`, data).then((r) => normalizeActionResult(r.data)),

  delete: (id: string) =>
    api.delete(`/machines/${id}`).then((r) => normalizeActionResult(r.data)),

  approve: (id: string) =>
    api.post(`/machines/${id}/approve`).then((r) => normalizeActionResult(r.data)),

  reject: (id: string) =>
    api.post(`/machines/${id}/reject`).then((r) => normalizeActionResult(r.data)),

  revoke: (id: string) =>
    api.post(`/machines/${id}/revoke`).then((r) => normalizeActionResult(r.data)),

  getHourlyProduction: (id: string) =>
    api.get(`/machines/${id}/hourly-production`).then((r) => normalizeHourlyProductionList(r.data)),

  getHealth: (id: string) => api.get<MachineHealth>(`/machines/${id}/health`).then((r) => r.data),
};
