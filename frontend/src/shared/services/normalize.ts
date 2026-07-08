import type {
  ApiActionResult,
  PlcAlarm,
  PlcCounterTelemetry,
  PlcTelemetry,
  ProductionLine,
} from '../types/domain';
import { normalizeAlarmSeverity, normalizeAlarmStatus, normalizeApprovalStatus, normalizeMachineStatus, normalizeRole } from '../lib/utils';
import type { AuditLog } from '../../features/admin/services/auditLogs.api';
import type { DashboardSummary, HourlyPoint, RecentAlarm } from '../../features/dashboard/services/dashboard.api';
import type { Alarm } from '../../features/alarms/services/alarms.api';
import type { HourlyProduction, Machine } from '../../features/machines/services/machines.api';
import type { LoginResponse } from '../../features/auth/services/auth.api';
import type { User } from '../../features/admin/services/users.api';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!looksLikeJson) return value;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): UnknownRecord | undefined {
  const parsed = parseMaybeJson(value);
  return isRecord(parsed) ? parsed : undefined;
}

function asArray(value: unknown): unknown[] {
  const parsed = parseMaybeJson(value);
  return Array.isArray(parsed) ? parsed : [];
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

function readNumber(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function readBoolean(record: UnknownRecord, key: string): boolean | undefined {
  const value = record[key];

  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }

  return undefined;
}

function readDateString(record: UnknownRecord, key: string): string | undefined {
  const value = readString(record, key);
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function compactString(value: string | undefined): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function normalizePlcAlarm(value: unknown): PlcAlarm | undefined {
  if (typeof value === 'string') {
    const message = compactString(value);
    if (!message) return undefined;
    return { message };
  }

  const record = asRecord(value);
  if (!record) return undefined;

  const code = readString(record, 'code') ?? readString(record, 'error_id');
  const message = readString(record, 'message') ?? readString(record, 'error_name');
  const description = readString(record, 'error_description') ?? message;
  const time =
    readDateString(record, 'error_time') ??
    readDateString(record, 'createdAt') ??
    readDateString(record, 'timestamp');
  const acknowledged = readBoolean(record, 'error_ack');

  if (!code && !message && !description && !time && acknowledged === undefined) {
    return undefined;
  }

  return {
    code,
    message,
    error_id: code,
    error_name: message,
    error_description: description,
    error_time: time,
    error_ack: acknowledged,
  };
}

function normalizePlcAlarmList(value: unknown): PlcAlarm[] {
  return asArray(value)
    .map(normalizePlcAlarm)
    .filter((item): item is PlcAlarm => !!item);
}

function normalizePlcCounters(value: unknown): PlcCounterTelemetry | undefined {
  const record = asRecord(value);
  if (!record) return undefined;

  return {
    plc_runtime: readNumber(record, 'plc_runtime') ?? 0,
    current_heatsink_no: readNumber(record, 'current_heatsink_no') ?? 0,
    current_screw_no: readNumber(record, 'current_screw_no') ?? 0,
    current_screw_count: readNumber(record, 'current_screw_count') ?? 0,
    photo_screw_count: readNumber(record, 'photo_screw_count') ?? 0,
    photo_count: readNumber(record, 'photo_count') ?? 0,
    pre_lock_count: readNumber(record, 'pre_lock_count') ?? 0,
  };
}

export function normalizePlcTelemetry(value: unknown): PlcTelemetry | undefined {
  let record = asRecord(value);
  if (!record) return undefined;

  // Unpack MQTT envelope payload if present from ClientPLC
  if (record.payload) {
    const payload = asRecord(record.payload);
    if (payload) {
      record = { ...record, ...payload };
    }
  }

  const computer = asRecord(record.computer) ?? {};
  const machine = asRecord(record.machine) ?? {};
  const production = asRecord(record.production) ?? {};
  const statusFlags = asRecord(record.statusObj) ?? asRecord(record.status) ?? {};
  const alarm = asRecord(record.alarm);

  const machineStatus = normalizeMachineStatus(readString(record, 'status'));
  const plcConnected = readBoolean(record, 'plcConnected');

  const normalizedErrors = normalizePlcAlarmList(record.error);
  const normalizedAlarms = normalizePlcAlarmList(record.alarms);

  if ((readBoolean(alarm ?? {}, 'active') ?? false) === true) {
    normalizedAlarms.push({
      code: readString(alarm ?? {}, 'code') ?? 'ALARM',
      message: readString(alarm ?? {}, 'message') ?? 'Active alarm',
    });
  }

  return {
    productionCount: readNumber(record, 'productionCount') ?? readNumber(production, 'qty') ?? readNumber(production, 'productionCount') ?? 0,
    machineRuntimeSeconds: readNumber(record, 'machineRuntimeSeconds') ?? readNumber(production, 'runtime') ?? 0,
    clientUptimeSeconds: readNumber(record, 'clientUptimeSeconds') ?? readNumber(computer, 'uptimeSeconds') ?? 0,
    plcConnected,
    timestamp:
      readDateString(record, 'timestamp') ??
      readDateString(record, 'sentAt') ??
      readDateString(record, 'receivedAt') ??
      readDateString(record, 'createdAt'),
    computer: {
      cpuPercent: readNumber(computer, 'cpuPercent'),
      ramPercent: readNumber(computer, 'ramPercent'),
      uptimeSeconds:
        readNumber(computer, 'uptimeSeconds') ??
        readNumber(machine, 'uptime') ??
        readNumber(record, 'clientUptimeSeconds'),
      name: readString(computer, 'name') ?? readString(computer, 'computerName'),
      ipAddress: readString(computer, 'ipAddress'),
      ramUsedMb: readNumber(computer, 'ramUsedMb'),
      ramTotalMb: readNumber(computer, 'ramTotalMb'),
    },
    tags: {
      temperature: readNumber(record, 'temperature') ?? readNumber(record, 'Temperature'),
      pressure: readNumber(record, 'pressure') ?? readNumber(record, 'Pressure'),
      ...asRecord(record.tags),
      // Fallback mappings for OEE/UPH/Yield from ClientPLC production metrics
      oee: readNumber(record, 'oee') ?? readNumber(production, 'oee'),
      uph: readNumber(record, 'uph') ?? readNumber(production, 'uph'),
      yieldRate: readNumber(record, 'yieldRate') ?? readNumber(production, 'yieldRate'),
    },
    alarms: normalizedAlarms,
    status: {
      start: readBoolean(statusFlags, 'start') ?? machineStatus === 'running',
      stop: readBoolean(statusFlags, 'stop') ?? machineStatus !== 'running',
      error: readBoolean(statusFlags, 'error') ?? machineStatus === 'error',
    },
    machine: {
      cpu: readNumber(machine, 'cpu') ?? readNumber(computer, 'cpuPercent') ?? 0,
      ram: readNumber(machine, 'ram') ?? readNumber(computer, 'ramPercent') ?? 0,
      uptime:
        readNumber(machine, 'uptime') ??
        readNumber(computer, 'uptimeSeconds') ??
        readNumber(record, 'clientUptimeSeconds') ??
        0,
    },
    production: {
      qty: readNumber(production, 'qty') ?? readNumber(record, 'productionCount') ?? 0,
      runtime: readNumber(production, 'runtime') ?? readNumber(record, 'machineRuntimeSeconds') ?? 0,
      oee: readNumber(production, 'oee') ?? readNumber(record, 'oee'),
      uph: readNumber(production, 'uph') ?? readNumber(record, 'uph'),
      yieldRate: readNumber(production, 'yieldRate') ?? readNumber(record, 'yieldRate'),
      shiftSummary: asRecord(production.shiftSummary) ?? asRecord(record.shiftSummary),
    },
    error: normalizedErrors,
    plc: normalizePlcCounters(record.plc),
  };
}

export function normalizeMachine(value: unknown): Machine {
  const record = asRecord(value) ?? {};
  const lastPlcData = normalizePlcTelemetry(record.lastPlcData);

  return {
    id: readString(record, 'id') ?? '',
    name: readString(record, 'name') ?? 'Unknown machine',
    machineCode: compactString(readString(record, 'machineCode')),
    ip: compactString(readString(record, 'ip')),
    status: normalizeMachineStatus(readString(record, 'status')),
    plcConnected: readBoolean(record, 'plcConnected') ?? lastPlcData?.plcConnected,
    clientId: compactString(readString(record, 'clientId')),
    approvalStatus: normalizeApprovalStatus(readString(record, 'approvalStatus'), 'APPROVED'),
    cpuPercent: readNumber(record, 'cpuPercent') ?? lastPlcData?.machine?.cpu ?? 0,
    ramPercent: readNumber(record, 'ramPercent') ?? lastPlcData?.machine?.ram ?? 0,
    uptimeSeconds: readNumber(record, 'uptimeSeconds') ?? lastPlcData?.machine?.uptime ?? 0,
    lastHeartbeat: readDateString(record, 'lastHeartbeat'),
    lastPlcData,
    sequenceOrder: readNumber(record, 'sequenceOrder'),
    createdAt: readDateString(record, 'createdAt'),
    lineNames: compactString(readString(record, 'lineNames')),
  };
}

export function normalizeHourlyProduction(value: unknown): HourlyProduction {
  const record = asRecord(value) ?? {};

  return {
    prodDate: readString(record, 'prodDate') ?? '',
    prodHour: readNumber(record, 'prodHour') ?? 0,
    producedQtyStart: readNumber(record, 'producedQtyStart') ?? 0,
    producedQtyEnd: readNumber(record, 'producedQtyEnd') ?? 0,
    hourlyQty: readNumber(record, 'hourlyQty') ?? 0,
    plcRunTimeStart: readNumber(record, 'plcRunTimeStart') ?? 0,
    plcRunTimeEnd: readNumber(record, 'plcRunTimeEnd') ?? 0,
    avgCpu: readNumber(record, 'avgCpu') ?? 0,
    avgRam: readNumber(record, 'avgRam') ?? 0,
    receivedAt: readDateString(record, 'receivedAt') ?? '',
  };
}

export function normalizeProductionLine(value: unknown): ProductionLine {
  const record = asRecord(value) ?? {};

  return {
    id: readString(record, 'id') ?? '',
    name: readString(record, 'name') ?? 'Unnamed line',
    description: compactString(readString(record, 'description')),
    status: normalizeProductionLineStatus(readString(record, 'status')),
    createdAt: readDateString(record, 'createdAt'),
    machineCount: readNumber(record, 'machineCount'),
  };
}

function normalizeProductionLineStatus(value: unknown): 'active' | 'inactive' | 'maintenance' {
  const status = String(value ?? '').toLowerCase();
  if (status === 'inactive') return 'inactive';
  if (status === 'maintenance') return 'maintenance';
  return 'active';
}

export function normalizeAlarm(value: unknown): Alarm {
  const record = asRecord(value) ?? {};

  return {
    id: readNumber(record, 'id') ?? 0,
    machineId: readString(record, 'machineId') ?? '',
    machineName: readString(record, 'machineName') ?? 'Unknown machine',
    severity: normalizeAlarmSeverity(readString(record, 'severity')),
    message: readString(record, 'message') ?? 'Unknown alarm',
    status: normalizeAlarmStatus(readString(record, 'status')),
    acknowledgedBy: compactString(readString(record, 'acknowledgedBy')),
    acknowledgedAt: readDateString(record, 'acknowledgedAt'),
    resolvedAt: readDateString(record, 'resolvedAt'),
    notes: compactString(readString(record, 'notes')),
    createdAt: readDateString(record, 'createdAt') ?? '',
  };
}

export function normalizeAuditLog(value: unknown): AuditLog {
  const record = asRecord(value) ?? {};

  return {
    id: readNumber(record, 'id') ?? 0,
    username: readString(record, 'username') ?? 'unknown',
    action: readString(record, 'action') ?? 'UNKNOWN',
    details: compactString(readString(record, 'details')),
    createdAt: readDateString(record, 'createdAt') ?? '',
  };
}

export function normalizeUser(value: unknown): User {
  const record = asRecord(value) ?? {};

  return {
    id: readNumber(record, 'id') ?? 0,
    username: readString(record, 'username') ?? 'unknown',
    role: normalizeRole(readString(record, 'role')),
  };
}

export function normalizeLoginResponse(value: unknown): LoginResponse {
  const record = asRecord(value) ?? {};

  return {
    token: readString(record, 'token') ?? '',
    username: readString(record, 'username') ?? '',
    role: normalizeRole(readString(record, 'role')),
  };
}

export function normalizeRecentAlarm(value: unknown): RecentAlarm {
  const alarm = normalizeAlarm(value);
  return {
    id: alarm.id,
    machineId: alarm.machineId,
    machineName: alarm.machineName,
    severity: alarm.severity,
    message: alarm.message,
    status: alarm.status,
    createdAt: alarm.createdAt,
  };
}

export function normalizeHourlyPoint(value: unknown): HourlyPoint {
  const record = asRecord(value) ?? {};

  return {
    prodDate: readString(record, 'prodDate') ?? '',
    prodHour: readNumber(record, 'prodHour') ?? 0,
    totalQty: readNumber(record, 'totalQty') ?? 0,
  };
}

export function normalizeDashboardSummary(value: unknown): DashboardSummary {
  const record = asRecord(value) ?? {};

  return {
    totalLines: readNumber(record, 'totalLines') ?? 0,
    totalMachines: readNumber(record, 'totalMachines') ?? 0,
    running: readNumber(record, 'running') ?? 0,
    idle: readNumber(record, 'idle') ?? 0,
    error: readNumber(record, 'error') ?? 0,
    offline: readNumber(record, 'offline') ?? 0,
    totalProduction: readNumber(record, 'totalProduction') ?? 0,
    activeAlarms: readNumber(record, 'activeAlarms') ?? 0,
    plcClientsOnline: readNumber(record, 'plcClientsOnline') ?? 0,
    recentAlarms: asArray(record.recentAlarms).map(normalizeRecentAlarm),
    hourlyData: asArray(record.hourlyData).map(normalizeHourlyPoint),
  };
}

export function normalizeActionResult(value: unknown): ApiActionResult {
  const record = asRecord(value) ?? {};

  return {
    success: readBoolean(record, 'success'),
    message: compactString(readString(record, 'message')),
    sequenceOrder: readNumber(record, 'sequenceOrder'),
  };
}

export function normalizeMachineList(value: unknown): Machine[] {
  return asArray(value).map(normalizeMachine);
}

export function normalizeProductionLineList(value: unknown): ProductionLine[] {
  return asArray(value).map(normalizeProductionLine);
}

export function normalizeAlarmList(value: unknown): Alarm[] {
  return asArray(value).map(normalizeAlarm);
}

export function normalizeAuditLogList(value: unknown): AuditLog[] {
  return asArray(value).map(normalizeAuditLog);
}

export function normalizeUserList(value: unknown): User[] {
  return asArray(value).map(normalizeUser);
}

export function normalizeHourlyProductionList(value: unknown): HourlyProduction[] {
  return asArray(value).map(normalizeHourlyProduction);
}
