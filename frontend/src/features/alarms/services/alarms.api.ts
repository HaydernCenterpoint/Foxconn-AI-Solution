import { api } from '../../../shared/services/apiClient';
import { normalizeActionResult, normalizeAlarmList } from '../../../shared/services/normalize';

export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlarmSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Alarm {
  id: number;
  machineId: string;
  machineName: string;
  severity: AlarmSeverity;
  message: string;
  status: AlarmStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  notes?: string;
  createdAt: string;
}

export const alarmsApi = {
  getAll: (params?: { status?: string; severity?: string; limit?: number }) =>
    api.get('/alarms', { params }).then((r) => normalizeAlarmList(r.data)),

  acknowledge: (id: number, notes?: string) =>
    api.post(`/alarms/${id}/acknowledge`, { notes }).then((r) => normalizeActionResult(r.data)),

  resolve: (id: number, notes?: string) =>
    api.post(`/alarms/${id}/resolve`, { notes }).then((r) => normalizeActionResult(r.data)),
};
