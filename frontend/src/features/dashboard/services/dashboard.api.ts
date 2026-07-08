import { api } from '../../../shared/services/apiClient';
import { normalizeDashboardSummary } from '../../../shared/services/normalize';

export interface DashboardSummary {
  totalLines: number;
  totalMachines: number;
  running: number;
  idle: number;
  error: number;
  offline: number;
  totalProduction: number;
  activeAlarms: number;
  plcClientsOnline: number;
  recentAlarms: RecentAlarm[];
  hourlyData: HourlyPoint[];
}

export interface RecentAlarm {
  id: number;
  machineId: string;
  machineName: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
}

export interface HourlyPoint {
  prodDate: string;
  prodHour: number;
  totalQty: number;
}

export const dashboardApi = {
  getSummary: () =>
    api.get('/dashboard/summary').then((r) => normalizeDashboardSummary(r.data)),
};
