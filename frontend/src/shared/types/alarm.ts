export type AlarmSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlarmStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface Alarm {
  id: number;
  machineId: string;
  machineName: string;
  severity: AlarmSeverity;
  message: string;
  status: AlarmStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  notes: string | null;
  createdAt: string;
}
