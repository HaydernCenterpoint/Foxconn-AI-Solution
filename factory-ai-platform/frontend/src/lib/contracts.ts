/**
 * Shared data contracts for MKZ Factory Monitor
 * Based on the shared contracts from the prompt framework:
 * - asset_id: UUID
 * - telemetry schema: (time, asset_id, metric, value)
 * - event schema: (event_id, timestamp, asset_id, type, severity, payload)
 */

// ---------------------------------------------------------------------------
// Asset
// ---------------------------------------------------------------------------

export interface Asset {
  id: string // UUID
  name: string
  type: 'plant' | 'line' | 'machine' | 'sensor'
  parentId: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface TelemetryPoint {
  time: string // ISO 8601
  assetId: string // UUID
  metric: string
  value: number
}

export interface TelemetrySnapshot {
  machineId: string
  machineName: string
  lineCode: string
  timestamp: string
  status: string
  metrics: {
    temperature?: number
    vibration?: number
    cycleTime?: number
    oee?: number
    availability?: number
    performance?: number
    quality?: number
  }
}

export interface ProductionRecord {
  time: string
  lineId: string
  lineCode: string
  goodCount: number
  rejectCount: number
  totalCount: number
  cycleTime: number
  uptime: number
}

export interface ProductionReport {
  timeRange: string
  groupBy: string
  records: ProductionRecord[]
  summary: {
    totalGood: number
    totalReject: number
    avgCycleTime: number
    avgOee: number
  }
}

// ---------------------------------------------------------------------------
// Events / Alarms
// ---------------------------------------------------------------------------

export type AlarmSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface Alarm {
  id: string
  timestamp: string
  assetId: string
  machineName: string
  lineCode: string
  type: string
  severity: AlarmSeverity
  status: AlarmStatus
  message: string
  payload: Record<string, unknown>
}

export interface Event {
  eventId: string
  timestamp: string
  assetId: string
  type: string
  severity: AlarmSeverity
  payload: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  totalMachines: number
  runningMachines: number
  activeAlarms: number
  criticalAlarms: number
  todayProduction: number
  todayTarget: number
  avgOee: number
  lines: Array<{
    lineId: string
    lineCode: string
    machines: number
    running: number
    production: number
    target: number
  }>
}

// ---------------------------------------------------------------------------
// API Response wrappers
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string
  message: string
  status?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// ---------------------------------------------------------------------------
// Filter / Query types
// ---------------------------------------------------------------------------

export interface TimeRange {
  start: string
  end: string
}

export type GroupBy = 'minute' | 'hour' | 'shift' | 'day' | '7d' | '30d' | 'week' | 'month'

export interface TelemetryQuery {
  assetId?: string
  metrics?: string[]
  timeRange: TimeRange
  groupBy?: GroupBy
}
