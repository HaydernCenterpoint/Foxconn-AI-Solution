export interface Machine {
  id: string;
  name: string;
  machineCode: string;
  ip: string;
  status: string; // 'running', 'idle', 'error', 'offline'
  plcConnected: boolean;
  clientId: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  cpuPercent: number;
  ramPercent: number;
  uptimeSeconds: number;
  lastHeartbeat: string | null;
  createdAt: string;
  lineNames?: string;
  sequenceOrder?: number;
  lastPlcData?: unknown;
  lineId?: string | null;
}

export interface SimulationConfig {
  machineId: string;
  enabled: boolean;
  temperatureMin: number;
  temperatureMax: number;
  pressureMin: number;
  pressureMax: number;
  speedMin: number;
  speedMax: number;
  productionRate: number;
  errorProbability: number;
  updatedAt: string;
  machineName: string;
  machineIp: string;
  machineStatus: string;
  cpuPercent: number;
  ramPercent: number;
  liveData: LiveData | null;
}

export interface LiveData {
  temperature: number;
  pressure: number;
  speed: number;
  productionCount: number;
  status: string;
  cpuPercent: number;
  ramPercent: number;
  uptimeSeconds: number;
  lastUpdated: string;
}

export interface HourlyProduction {
  prodDate: string;
  prodHour: number;
  producedQtyStart: number;
  producedQtyEnd: number;
  hourlyQty: number;
  plcRunTimeStart: number;
  plcRunTimeEnd: number;
  avgCpu: number;
  avgRam: number;
  receivedAt: string;
}
