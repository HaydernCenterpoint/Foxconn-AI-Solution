import type { DashboardSummary, HourlyPoint, RecentAlarm } from './services/dashboard.api';
import type { Machine } from '../machines/services/machines.api';
import type { ProductionLine } from '../../shared/types/domain';

type DashboardTelemetry = Machine['lastPlcData'];

export interface DashboardMachine {
  id: string;
  name: string;
  status?: string;
  approvalStatus?: Machine['approvalStatus'];
  lineId?: string | null;
  lineNames?: string;
  lastPlcData?: DashboardTelemetry;
}

export interface DashboardViewModelSource {
  summary?: DashboardSummary | null;
  machines?: readonly DashboardMachine[] | null;
  lines?: readonly ProductionLine[] | null;
}

export type DashboardKpiId = 'total-production' | 'production-efficiency' | 'active-alarms';

export interface DashboardKpiCard {
  id: DashboardKpiId;
  value: number;
  unit: 'units' | '%' | 'alarms';
}

export interface DashboardStockBar {
  name: string;
  current: number;
  threshold: number;
  hasData: boolean;
}

export interface DashboardDefects {
  total: number;
  rate: number;
  nonDefectiveTotal: number;
  nonDefectiveRate: number;
  hasData: boolean;
}

export interface DashboardTrendPoint {
  name: string;
  production: number;
  waste: number;
  hasData: boolean;
}

export type DashboardLineStatus = 'active' | 'idle' | 'maintenance' | 'error' | 'offline' | 'unknown';

export interface DashboardLineStatusRow {
  id: string;
  name: string;
  status: DashboardLineStatus;
  machineCount: number;
  producedQuantity: number;
}

export interface DashboardPendingOrderRow {
  id: string;
  machineId: string;
  machineName: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface DashboardTopProduct {
  id: string;
  name: string;
  quantity: number;
}

export interface DashboardViewModel {
  kpis: DashboardKpiCard[];
  stockBars: DashboardStockBar[];
  defects: DashboardDefects;
  trend: DashboardTrendPoint[];
  lineStatuses: DashboardLineStatusRow[];
  pendingOrders: DashboardPendingOrderRow[];
  topProducts: DashboardTopProduct[];
}

const STOCK_POINT_COUNT = 12;

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function readTelemetryNumber(machine: DashboardMachine, fields: readonly string[]): number {
  const telemetry = machine.lastPlcData;
  if (!telemetry) return 0;

  const candidates: unknown[] = [
    telemetry.production?.qty,
    telemetry.productionCount,
    telemetry.plc?.photo_count,
    ...fields.map((field) => telemetry.tags?.[field]),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }
  }

  return 0;
}

function readYieldRate(machine: DashboardMachine): number | null {
  const telemetry = machine.lastPlcData;
  const candidate = telemetry?.production?.yieldRate ?? telemetry?.tags?.yieldRate;

  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;

  return Math.min(100, Math.max(0, candidate));
}

function readOeeRate(machine: DashboardMachine): number | null {
  const telemetry = machine.lastPlcData;
  const candidate = telemetry?.production?.oee ?? telemetry?.tags?.oee;

  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return null;

  return Math.min(100, Math.max(0, candidate));
}

function formatHour(hour: unknown): string {
  if (typeof hour !== 'number' || !Number.isFinite(hour)) return '';
  return `${String(Math.trunc(hour)).padStart(2, '0')}:00`;
}

function compareHourlyPoints(left: HourlyPoint, right: HourlyPoint): number {
  const leftTimestamp = `${left.prodDate}\u0000${String(left.prodHour).padStart(2, '0')}`;
  const rightTimestamp = `${right.prodDate}\u0000${String(right.prodHour).padStart(2, '0')}`;
  return leftTimestamp.localeCompare(rightTimestamp);
}

function buildStockBars(hourlyData: readonly HourlyPoint[]): DashboardStockBar[] {
  const observed = [...hourlyData]
    .sort(compareHourlyPoints)
    .slice(-STOCK_POINT_COUNT)
    .map((point) => ({
      name: formatHour(point.prodHour),
      current: nonNegativeNumber(point.totalQty),
      hasData: true,
    }));
  const threshold = observed.reduce((highest, point) => Math.max(highest, point.current), 0);
  const padding = Array.from({ length: STOCK_POINT_COUNT - observed.length }, (): DashboardStockBar => ({
    name: '',
    current: 0,
    threshold: 0,
    hasData: false,
  }));

  return [
    ...padding,
    ...observed.map((point) => ({
      ...point,
      threshold,
    })),
  ];
}

function buildTrend(stockBars: readonly DashboardStockBar[], defectRate: number): DashboardTrendPoint[] {
  return stockBars.map((point) => ({
    name: point.name,
    production: point.current,
    waste: point.hasData ? Math.round((point.current * defectRate) / 100) : 0,
    hasData: point.hasData,
  }));
}

function normalizeMachineStatus(status: string | undefined): DashboardLineStatus {
  switch (status?.trim().toLowerCase()) {
    case 'running':
    case 'active':
      return 'active';
    case 'idle':
    case 'stopped':
    case 'inactive':
      return 'idle';
    case 'maintenance':
      return 'maintenance';
    case 'error':
      return 'error';
    case 'offline':
    case 'disconnected':
      return 'offline';
    default:
      return 'unknown';
  }
}

function resolveLineStatus(
  machines: readonly DashboardMachine[],
  configuredStatus: ProductionLine['status'],
): DashboardLineStatus {
  const statuses = new Set(machines.map((machine) => normalizeMachineStatus(machine.status)));

  if (statuses.has('error')) return 'error';
  if (statuses.has('maintenance')) return 'maintenance';
  if (statuses.has('active')) return 'active';
  if (statuses.has('idle')) return 'idle';
  if (statuses.has('offline')) return 'offline';

  return normalizeMachineStatus(configuredStatus);
}

function machineBelongsToLine(machine: DashboardMachine, line: ProductionLine): boolean {
  if (machine.lineId === line.id) return true;
  if (!machine.lineNames) return false;

  const lineNames = machine.lineNames
    .split(/[,;|]/)
    .map((name) => name.trim().toLocaleLowerCase())
    .filter(Boolean);
  const targets = [line.id, line.name].map((value) => value.trim().toLocaleLowerCase());

  return targets.some((target) => lineNames.includes(target));
}

function alarmTimestamp(alarm: RecentAlarm): number {
  const timestamp = Date.parse(alarm.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function createDashboardViewModel({
  summary,
  machines: machineSource,
  lines: lineSource,
}: DashboardViewModelSource = {}): DashboardViewModel {
  const machines = (machineSource ?? []).filter((machine) =>
    !machine.approvalStatus || machine.approvalStatus.trim().toUpperCase() === 'APPROVED',
  );
  const lines = lineSource ?? [];
  const totalProductionFromMachines = machines.reduce(
    (total, machine) => total + readTelemetryNumber(machine, ['productionCount', 'qty']),
    0,
  );
  const totalProduction = summary
    ? nonNegativeNumber(summary.totalProduction)
    : totalProductionFromMachines;
  const oeeValues = machines
    .map(readOeeRate)
    .filter((oeeRate): oeeRate is number => oeeRate !== null);
  const productionEfficiency = oeeValues.length > 0
    ? roundToOneDecimal(oeeValues.reduce((total, oeeRate) => total + oeeRate, 0) / oeeValues.length)
    : 0;
  const yields = machines
    .map(readYieldRate)
    .filter((yieldRate): yieldRate is number => yieldRate !== null);
  const hasDefectData = yields.length > 0;
  const averageYield = hasDefectData
    ? yields.reduce((total, yieldRate) => total + yieldRate, 0) / yields.length
    : 0;
  const defectRate = hasDefectData ? roundToOneDecimal(100 - averageYield) : 0;
  const defectTotal = hasDefectData ? Math.round((totalProduction * defectRate) / 100) : 0;
  const nonDefectiveTotal = hasDefectData ? Math.max(0, totalProduction - defectTotal) : 0;
  const stockBars = buildStockBars(summary?.hourlyData ?? []);
  const alarms = summary?.recentAlarms ?? [];

  return {
    kpis: [
      { id: 'total-production', value: totalProduction, unit: 'units' },
      { id: 'production-efficiency', value: productionEfficiency, unit: '%' },
      {
        id: 'active-alarms',
        value: summary ? nonNegativeNumber(summary.activeAlarms) : 0,
        unit: 'alarms',
      },
    ],
    stockBars,
    defects: {
      total: defectTotal,
      rate: defectRate,
      nonDefectiveTotal,
      nonDefectiveRate: hasDefectData ? roundToOneDecimal(100 - defectRate) : 0,
      hasData: hasDefectData,
    },
    trend: buildTrend(stockBars, defectRate),
    lineStatuses: lines.map((line) => {
      const lineMachines = machines.filter((machine) => machineBelongsToLine(machine, line));
      const inferredMachineCount = lineMachines.length;
      const configuredMachineCount = nonNegativeNumber(line.machineCount);

      return {
        id: line.id,
        name: line.name,
        status: resolveLineStatus(lineMachines, line.status),
        machineCount: inferredMachineCount || configuredMachineCount,
        producedQuantity: lineMachines.reduce(
          (total, machine) => total + readTelemetryNumber(machine, ['productionCount', 'qty']),
          0,
        ),
      };
    }),
    pendingOrders: [...alarms]
      .sort((left, right) => alarmTimestamp(right) - alarmTimestamp(left))
      .map((alarm) => ({
        id: String(alarm.id),
        machineId: alarm.machineId,
        machineName: alarm.machineName || alarm.machineId,
        severity: alarm.severity,
        message: alarm.message,
        status: alarm.status,
        createdAt: alarm.createdAt,
      })),
    topProducts: machines
      .map((machine) => ({
        id: machine.id,
        name: machine.name || machine.id,
        quantity: readTelemetryNumber(machine, ['productionCount', 'qty']),
      }))
      .filter((product) => product.quantity > 0)
      .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name))
      .slice(0, 5),
  };
}
