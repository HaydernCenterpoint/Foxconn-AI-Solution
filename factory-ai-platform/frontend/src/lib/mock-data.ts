/**
 * Mock data for MKZ Factory Monitor
 * Provides realistic factory data for UI development before backend integration
 */
import type {
  Asset,
  TelemetrySnapshot,
  ProductionReport,
  Alarm,
  DashboardSummary,
  ProductionRecord,
} from './contracts'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function uuid(i: number): string {
  return `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600000).toISOString()
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60000).toISOString()
}

// ---------------------------------------------------------------------------
// Lines & Machines (Asset tree)
// ---------------------------------------------------------------------------

export const MOCK_LINES: Asset[] = [
  {
    id: uuid(1),
    name: 'LS18',
    type: 'line',
    parentId: uuid(900),
    metadata: { description: 'Main assembly line 18', target: 1200 },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(2),
    name: 'LS19',
    type: 'line',
    parentId: uuid(900),
    metadata: { description: 'Assembly line 19', target: 1000 },
    createdAt: hoursAgo(8760),
  },
]

export const MOCK_MACHINES: Asset[] = [
  // LS18 machines
  {
    id: uuid(101),
    name: 'Press-001',
    type: 'machine',
    parentId: uuid(1),
    metadata: { vendor: 'Mitsubishi', model: 'MP-2000', installDate: '2023-01-15' },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(102),
    name: 'Conveyor-002',
    type: 'machine',
    parentId: uuid(1),
    metadata: { vendor: 'Siemens', model: 'S7-1500', installDate: '2023-01-15' },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(103),
    name: 'RobotArm-003',
    type: 'machine',
    parentId: uuid(1),
    metadata: { vendor: 'Fanuc', model: 'M-20iA', installDate: '2023-03-01' },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(104),
    name: 'Welder-004',
    type: 'machine',
    parentId: uuid(1),
    metadata: { vendor: 'Miller', model: 'AutoArc', installDate: '2023-05-20' },
    createdAt: hoursAgo(8760),
  },
  // LS19 machines
  {
    id: uuid(201),
    name: 'Press-101',
    type: 'machine',
    parentId: uuid(2),
    metadata: { vendor: 'Mitsubishi', model: 'MP-3000', installDate: '2023-02-10' },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(202),
    name: 'Conveyor-102',
    type: 'machine',
    parentId: uuid(2),
    metadata: { vendor: 'Siemens', model: 'S7-1200', installDate: '2023-02-10' },
    createdAt: hoursAgo(8760),
  },
  {
    id: uuid(203),
    name: 'RobotArm-103',
    type: 'machine',
    parentId: uuid(2),
    metadata: { vendor: 'KUKA', model: 'KR60', installDate: '2023-06-01' },
    createdAt: hoursAgo(8760),
  },
]

export const MOCK_ASSETS: Asset[] = [
  {
    id: uuid(900),
    name: 'MKZ Factory',
    type: 'plant',
    parentId: null,
    metadata: { location: 'Hanoi, Vietnam', timezone: 'Asia/Ho_Chi_Minh' },
    createdAt: hoursAgo(8760 * 2),
  },
  ...MOCK_LINES,
  ...MOCK_MACHINES,
]

// ---------------------------------------------------------------------------
// Live Telemetry
// ---------------------------------------------------------------------------

const MACHINE_STATUSES = ['RUNNING', 'RUNNING', 'RUNNING', 'IDLE', 'DOWN'] as const

export function getMockLiveTelemetry(): TelemetrySnapshot[] {
  return MOCK_MACHINES.map((m, i) => {
    const status = MACHINE_STATUSES[i % MACHINE_STATUSES.length]
    const line = MOCK_LINES.find((l) => l.id === m.parentId)
    return {
      machineId: m.id,
      machineName: m.name,
      lineCode: line?.name ?? 'UNKNOWN',
      timestamp: minutesAgo(Math.floor(Math.random() * 5)),
      status,
      metrics: {
        temperature: 45 + Math.random() * 20,
        vibration: 0.5 + Math.random() * 2,
        cycleTime: status === 'RUNNING' ? 12 + Math.random() * 4 : 0,
        oee: status === 'RUNNING' ? 75 + Math.random() * 20 : status === 'IDLE' ? 30 : 0,
        availability: status === 'RUNNING' ? 85 + Math.random() * 10 : status === 'IDLE' ? 40 : 0,
        performance: status === 'RUNNING' ? 80 + Math.random() * 15 : 0,
        quality: status === 'RUNNING' ? 95 + Math.random() * 4 : 0,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Production History
// ---------------------------------------------------------------------------

export function getMockProductionHistory(
  timeRange = 'last_7_days',
  groupBy = 'day',
): ProductionReport {
  const now = new Date()
  const records: ProductionRecord[] = []

  const count = groupBy === 'hour' ? 24 : groupBy === 'day' || groupBy === '7d' ? 7 : 4
  const msPerUnit =
    groupBy === 'hour' ? 3600000 : groupBy === 'day' || groupBy === '7d' ? 86400000 : 604800000

  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * msPerUnit)
    const total = Math.floor(100 + Math.random() * 200)
    const reject = Math.floor(Math.random() * 10)
    records.push({
      time: time.toISOString(),
      lineId: uuid(1),
      lineCode: 'LS18',
      goodCount: total - reject,
      rejectCount: reject,
      totalCount: total,
      cycleTime: 12 + Math.random() * 3,
      uptime: 0.85 + Math.random() * 0.1,
    })
  }

  return {
    timeRange,
    groupBy,
    records,
    summary: {
      totalGood: records.reduce((s, r) => s + r.goodCount, 0),
      totalReject: records.reduce((s, r) => s + r.rejectCount, 0),
      avgCycleTime: records.reduce((s, r) => s + r.cycleTime, 0) / records.length,
      avgOee: records.reduce((s, r) => s + (r.uptime * 90), 0) / records.length,
    },
  }
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

export const MOCK_ALARMS: Alarm[] = [
  {
    id: uuid(501),
    timestamp: minutesAgo(5),
    assetId: uuid(101),
    machineName: 'Press-001',
    lineCode: 'LS18',
    type: 'OVERTEMP',
    severity: 'CRITICAL',
    status: 'ACTIVE',
    message: 'Temperature exceeds 70°C threshold on Press-001',
    payload: { threshold: 70, current: 74.2, sensor: 'TEMP-A1' },
  },
  {
    id: uuid(502),
    timestamp: minutesAgo(15),
    assetId: uuid(102),
    machineName: 'Conveyor-002',
    lineCode: 'LS18',
    type: 'HIGH_VIBRATION',
    severity: 'HIGH',
    status: 'ACTIVE',
    message: 'Abnormal vibration detected on Conveyor-002',
    payload: { threshold: 2.5, current: 3.1, sensor: 'VIB-A2' },
  },
  {
    id: uuid(503),
    timestamp: minutesAgo(30),
    assetId: uuid(201),
    machineName: 'Press-101',
    lineCode: 'LS19',
    type: 'OVERTEMP',
    severity: 'MEDIUM',
    status: 'ACKNOWLEDGED',
    message: 'Temperature approaching upper limit on Press-101',
    payload: { threshold: 65, current: 63.8, sensor: 'TEMP-B1' },
  },
  {
    id: uuid(504),
    timestamp: hoursAgo(1),
    assetId: uuid(104),
    machineName: 'Welder-004',
    lineCode: 'LS18',
    type: 'QUALITY_FLAG',
    severity: 'LOW',
    status: 'RESOLVED',
    message: 'Weld quality below threshold, maintenance performed',
    payload: { threshold: 98, current: 96.2, inspectionId: 'QC-12345' },
  },
  {
    id: uuid(505),
    timestamp: hoursAgo(2),
    assetId: uuid(203),
    machineName: 'RobotArm-103',
    lineCode: 'LS19',
    type: 'MAINTENANCE_DUE',
    severity: 'LOW',
    status: 'ACTIVE',
    message: 'Scheduled maintenance overdue for RobotArm-103',
    payload: { overdueHours: 48, lastMaintenance: hoursAgo(500) },
  },
]

// ---------------------------------------------------------------------------
// Dashboard Summary
// ---------------------------------------------------------------------------

export function getMockDashboardSummary(): DashboardSummary {
  return {
    totalMachines: MOCK_MACHINES.length,
    runningMachines: 5,
    activeAlarms: MOCK_ALARMS.filter((a) => a.status === 'ACTIVE').length,
    criticalAlarms: MOCK_ALARMS.filter(
      (a) => a.status === 'ACTIVE' && a.severity === 'CRITICAL',
    ).length,
    todayProduction: 892,
    todayTarget: 1200,
    avgOee: 82.4,
    lines: [
      {
        lineId: uuid(1),
        lineCode: 'LS18',
        machines: 4,
        running: 3,
        production: 520,
        target: 650,
      },
      {
        lineId: uuid(2),
        lineCode: 'LS19',
        machines: 3,
        running: 2,
        production: 372,
        target: 550,
      },
    ],
  }
}
