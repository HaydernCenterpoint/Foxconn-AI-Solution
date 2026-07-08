export type UserRole = 'ADMIN' | 'ENGINEER' | 'GUEST';

export type MachineStatus = 'running' | 'idle' | 'stopped' | 'error' | 'maintenance' | 'offline' | 'disconnected';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export type AlarmSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface ComputerTelemetry {
  cpuPercent?: number;
  ramPercent?: number;
  uptimeSeconds?: number;
  name?: string;
  ipAddress?: string;
  ramUsedMb?: number;
  ramTotalMb?: number;
}

export interface PlcStatusFlags {
  start: boolean;
  stop: boolean;
  error: boolean;
}

export interface MachineTelemetry {
  cpu: number;
  ram: number;
  uptime: number;
}

export interface ProductionTelemetry {
  qty: number;
  runtime: number;
  oee?: number;
  uph?: number;
  yieldRate?: number;
  shiftSummary?: Record<string, unknown>;
}

export interface PlcAlarm {
  code?: string;
  message?: string;
  error_id?: string;
  error_name?: string;
  error_description?: string;
  error_time?: string;
  error_ack?: boolean;
}

export interface PlcCounterTelemetry {
  plc_runtime: number;
  current_heatsink_no: number;
  current_screw_no: number;
  current_screw_count: number;
  photo_screw_count: number;
  photo_count: number;
  pre_lock_count: number;
}

export interface PlcTelemetry {
  productionCount?: number;
  machineRuntimeSeconds?: number;
  clientUptimeSeconds?: number;
  plcConnected?: boolean;
  timestamp?: string;
  computer?: ComputerTelemetry;
  tags?: Record<string, unknown>;
  alarms?: PlcAlarm[];
  status?: PlcStatusFlags;
  machine?: MachineTelemetry;
  production?: ProductionTelemetry;
  error?: PlcAlarm[];
  plc?: PlcCounterTelemetry;
}

export interface ProductionLine {
  id: string;
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | 'maintenance';
  createdAt?: string;
  machineCount?: number;
}

export interface LineRequest {
  name: string;
  description?: string;
}

export interface AddMachineToLineRequest {
  machineId: string;
  sequenceOrder?: number;
}

export interface ApiActionResult {
  success?: boolean;
  message?: string;
  sequenceOrder?: number;
}

export interface ApiError {
  status?: number;
  code: string;
  message: string;
  correlationId?: string;
  details?: unknown;
}
