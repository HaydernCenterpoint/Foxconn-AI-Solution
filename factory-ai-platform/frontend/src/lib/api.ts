/**
 * Mock API service layer
 * Simulates backend REST calls for UI development
 * Replace these with real fetch() calls once backend endpoints are ready
 */
import type {
  Asset,
  TelemetrySnapshot,
  ProductionReport,
  Alarm,
  DashboardSummary,
  GroupBy,
} from './contracts'
import {
  MOCK_ASSETS,
  MOCK_LINES,
  MOCK_MACHINES,
  getMockLiveTelemetry,
  getMockProductionHistory,
  MOCK_ALARMS,
  getMockDashboardSummary,
} from './mock-data'

// ---------------------------------------------------------------------------
// Simulated latency
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Asset API
// ---------------------------------------------------------------------------

export async function getAssets(): Promise<Asset[]> {
  await delay(200)
  return MOCK_ASSETS
}

export async function getAssetById(id: string): Promise<Asset | null> {
  await delay(100)
  return MOCK_ASSETS.find((a) => a.id === id) ?? null
}

export async function getLines(): Promise<Asset[]> {
  await delay(150)
  return MOCK_LINES
}

export async function getMachines(): Promise<Asset[]> {
  await delay(150)
  return MOCK_MACHINES
}

export async function getMachinesByLine(lineId: string): Promise<Asset[]> {
  await delay(100)
  return MOCK_MACHINES.filter((m) => m.parentId === lineId)
}

// ---------------------------------------------------------------------------
// Telemetry API
// ---------------------------------------------------------------------------

export async function getLiveTelemetry(): Promise<TelemetrySnapshot[]> {
  await delay(300)
  return getMockLiveTelemetry()
}

export async function getProductionHistory(
  timeRange = 'last_7_days',
  groupBy: GroupBy = 'day',
  _lineId?: string,
): Promise<ProductionReport> {
  await delay(400)
  return getMockProductionHistory(timeRange, groupBy)
}

// ---------------------------------------------------------------------------
// Alarms API
// ---------------------------------------------------------------------------

export async function getAlarms(filters?: {
  severity?: string
  status?: string
  lineCode?: string
}): Promise<Alarm[]> {
  await delay(250)
  let alarms = [...MOCK_ALARMS]
  if (filters?.severity) {
    alarms = alarms.filter((a) => a.severity === filters.severity)
  }
  if (filters?.status) {
    alarms = alarms.filter((a) => a.status === filters.status)
  }
  if (filters?.lineCode) {
    alarms = alarms.filter((a) => a.lineCode === filters.lineCode)
  }
  return alarms
}

export async function getActiveAlarms(): Promise<Alarm[]> {
  await delay(200)
  return MOCK_ALARMS.filter((a) => a.status === 'ACTIVE')
}

export async function acknowledgeAlarm(id: string): Promise<Alarm | null> {
  await delay(150)
  const alarm = MOCK_ALARMS.find((a) => a.id === id)
  if (!alarm) return null
  return { ...alarm, status: 'ACKNOWLEDGED' }
}

// ---------------------------------------------------------------------------
// Dashboard API
// ---------------------------------------------------------------------------

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await delay(300)
  return getMockDashboardSummary()
}

// ---------------------------------------------------------------------------
// Bottleneck
// ---------------------------------------------------------------------------

export async function getBottleneck(lineCode?: string): Promise<{
  machineName: string
  oee: number
  cycleTimeSeconds: number
  status: string
}> {
  await delay(350)
  const telemetries = getMockLiveTelemetry()
  const filtered = lineCode
    ? telemetries.filter((t) => t.lineCode === lineCode)
    : telemetries
  const worst = filtered.sort((a, b) => (a.metrics.oee ?? 100) - (b.metrics.oee ?? 100))[0]
  if (!worst) throw new Error('No telemetry data')
  return {
    machineName: worst.machineName,
    oee: worst.metrics.oee ?? 0,
    cycleTimeSeconds: worst.metrics.cycleTime ?? 0,
    status: worst.status,
  }
}
