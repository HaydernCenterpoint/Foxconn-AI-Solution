import type { Machine } from '../../features/machines/services/machines.api';
import type { PlcAlarm } from '../types/domain';

export interface MachineHealthSnapshot {
  cpu: number;
  ram: number;
  productionQty: number;
  runtimeSeconds: number;
  uptimeSeconds: number;
  plcOnline: boolean;
  connectedLabel: 'connected' | 'disconnected';
}

export interface MachineAlarmRow {
  id: string;
  name: string;
  description: string;
  time: string;
}

export function getMachineHealthSnapshot(machine: Machine): MachineHealthSnapshot {
  const plc = machine.lastPlcData;
  const plcOnline = Boolean(plc?.plcConnected || machine.plcConnected || plc?.status?.start !== undefined);

  return {
    cpu: plc?.machine?.cpu ?? plc?.computer?.cpuPercent ?? machine.cpuPercent ?? 0,
    ram: plc?.machine?.ram ?? plc?.computer?.ramPercent ?? machine.ramPercent ?? 0,
    productionQty: plc?.production?.qty ?? plc?.productionCount ?? 0,
    runtimeSeconds: plc?.production?.runtime ?? plc?.machineRuntimeSeconds ?? 0,
    uptimeSeconds: plc?.machine?.uptime ?? plc?.clientUptimeSeconds ?? machine.uptimeSeconds ?? 0,
    plcOnline,
    connectedLabel: plcOnline ? 'connected' : 'disconnected',
  };
}

function normalizeAlarmItem(alarm: PlcAlarm | string, fallbackTime?: string, index?: number): MachineAlarmRow | null {
  if (typeof alarm === 'string') {
    if (!alarm.trim()) return null;
    return {
      id: `alarm-${index ?? 0}`,
      name: alarm,
      description: alarm,
      time: fallbackTime ?? new Date().toISOString(),
    };
  }

  const id = alarm.code || alarm.error_id || `alarm-${index ?? 0}`;
  const name = alarm.error_name || alarm.message || 'Unknown alarm';
  const description = alarm.error_description || alarm.message || name;
  const time = alarm.error_time || fallbackTime || new Date().toISOString();

  return { id, name, description, time };
}

export function getMachineAlarmRows(machine: Machine): MachineAlarmRow[] {
  const plc = machine.lastPlcData;
  const fallbackTime = plc?.timestamp;
  const rows: MachineAlarmRow[] = [];

  for (const [index, alarm] of (plc?.error ?? []).entries()) {
    const row = normalizeAlarmItem(alarm, fallbackTime, index);
    if (row) rows.push(row);
  }

  for (const [index, alarm] of (plc?.alarms ?? []).entries()) {
    const row = normalizeAlarmItem(alarm, fallbackTime, index + rows.length);
    if (row) rows.push(row);
  }

  return rows;
}
