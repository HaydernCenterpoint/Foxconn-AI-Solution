import type { Machine } from '../../machines/services/machines.api';
import { normalizeMachineStatus } from '../../../shared/lib/utils';

export type MachineMetric = 'oee' | 'yieldRate' | 'uph' | 'output' | 'runtime';

export function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

export function readText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isApprovedMachine(machine: Machine): boolean {
  return machine.approvalStatus.toUpperCase() === 'APPROVED';
}

export function sortMachines(machines: Machine[]): Machine[] {
  return [...machines].sort((left, right) => {
    const orderDifference = (left.sequenceOrder ?? Number.MAX_SAFE_INTEGER) - (right.sequenceOrder ?? Number.MAX_SAFE_INTEGER);
    if (orderDifference !== 0) return orderDifference;
    return left.name.localeCompare(right.name);
  });
}

export function getMachineStatus(machine: Machine) {
  return normalizeMachineStatus(machine.status);
}

export function getMachineMetric(machine: Machine, metric: MachineMetric): number | undefined {
  const telemetry = machine.lastPlcData;
  if (!telemetry) return undefined;

  const production = telemetry.production;
  const tags = telemetry.tags ?? {};

  switch (metric) {
    case 'oee':
      return readFiniteNumber(production?.oee) ?? readFiniteNumber(tags.oee);
    case 'yieldRate':
      return readFiniteNumber(production?.yieldRate) ?? readFiniteNumber(tags.yieldRate);
    case 'uph':
      return readFiniteNumber(production?.uph) ?? readFiniteNumber(tags.uph);
    case 'output':
      return readFiniteNumber(telemetry.productionCount) ?? readFiniteNumber(production?.qty);
    case 'runtime':
      return readFiniteNumber(telemetry.machineRuntimeSeconds) ?? readFiniteNumber(production?.runtime);
    default:
      return undefined;
  }
}

export function averageMachineMetric(machines: Machine[], metric: MachineMetric): number | undefined {
  const values = machines
    .map((machine) => getMachineMetric(machine, metric))
    .filter((value): value is number => value !== undefined);

  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getAggregateMachineStatus(machines: Machine[]): ReturnType<typeof getMachineStatus> {
  const statuses = machines.map(getMachineStatus);
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('running')) return 'running';
  if (statuses.includes('idle')) return 'idle';
  if (statuses.includes('maintenance')) return 'maintenance';
  if (statuses.includes('stopped')) return 'stopped';
  if (statuses.includes('disconnected')) return 'disconnected';
  return 'offline';
}

export function getMachineStatusCounts(machines: Machine[]) {
  return machines.reduce(
    (counts, machine) => {
      counts[getMachineStatus(machine)] += 1;
      return counts;
    },
    {
      running: 0,
      idle: 0,
      error: 0,
      stopped: 0,
      maintenance: 0,
      offline: 0,
      disconnected: 0,
    },
  );
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
