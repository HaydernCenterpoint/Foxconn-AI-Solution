import type { SimulationData } from '../../../shared/types/simulation';
import { api } from '../../../shared/services/apiClient';

export type { SimulationData };

type SimulationRecord = Record<string, unknown>;

function isRecord(value: unknown): value is SimulationRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(record: SimulationRecord, key: string): number {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function readString(record: SimulationRecord, key: string, fallback = ''): string {
  const value = record[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normalizeSimulation(machineId: string, value: unknown): SimulationData {
  const record = isRecord(value) ? value : {};
  const state = isRecord(record.state) ? record.state : record;
  const id = readString(record, 'machineId', machineId) || machineId;

  return {
    machineId: id,
    temperature: readNumber(state, 'temperature') || readNumber(state, 'Temperature'),
    pressure: readNumber(state, 'pressure') || readNumber(state, 'Pressure'),
    speed: readNumber(state, 'speed') || readNumber(state, 'Speed'),
    productionCount: readNumber(state, 'productionCount') || readNumber(state, 'ProductionCount'),
    status: (readString(state, 'status') || readString(state, 'Status', 'idle')) as SimulationData['status'],
    uptimeSeconds: readNumber(state, 'uptimeSeconds') || readNumber(state, 'UptimeSeconds'),
    cpuPercent: readNumber(state, 'cpuPercent') || readNumber(state, 'CpuPercent'),
    ramPercent: readNumber(state, 'ramPercent') || readNumber(state, 'RamPercent'),
    timestamp: readString(state, 'timestamp') || readString(state, 'lastUpdated') || readString(state, 'LastUpdated') || new Date().toISOString(),
  };
}

function normalizeSimulationMap(value: unknown): Record<string, SimulationData> {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, SimulationData>>((acc, item) => {
      if (!isRecord(item)) return acc;
      const machineId = readString(item, 'machineId');
      if (!machineId) return acc;
      acc[machineId] = normalizeSimulation(machineId, item);
      return acc;
    }, {});
  }

  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, SimulationData>>((acc, [machineId, item]) => {
    acc[machineId] = normalizeSimulation(machineId, item);
    return acc;
  }, {});
}

// Fetch all machines' simulation data
export async function getSimulationAll(): Promise<Record<string, SimulationData>> {
  const res = await api.get('/simulation/all');
  return normalizeSimulationMap(res.data);
}

// Fetch one machine's simulation data
export async function getSimulationMachine(id: string): Promise<SimulationData> {
  const res = await api.get(`/simulation/machines/${id}/data`);
  return normalizeSimulation(id, res.data);
}

// Get all simulation configs (list mode with machine config details)
export async function getSimulationConfigs(): Promise<Record<string, unknown>[]> {
  const res = await api.get('/simulation/machines');
  return Array.isArray(res.data) ? res.data : [];
}

// Reset simulation data
export async function resetSimulation(id: string): Promise<void> {
  await api.post(`/simulation/reset/${id}`);
}

// Toggle simulation
export async function toggleSimulation(id: string): Promise<void> {
  await api.post(`/simulation/machines/${id}/toggle`);
}

// Update simulation config
export async function updateSimulationConfig(
  id: string,
  config: Partial<{
    enabled: boolean;
    temperatureMin: number;
    temperatureMax: number;
    pressureMin: number;
    pressureMax: number;
    speedMin: number;
    speedMax: number;
    productionRate: number;
    errorProbability: number;
  }>
): Promise<void> {
  await api.put(`/simulation/machines/${id}`, config);
}
