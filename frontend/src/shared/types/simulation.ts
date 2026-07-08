export interface SimulationData {
  machineId: string;
  temperature: number;
  pressure: number;
  speed: number;
  productionCount: number;
  status: 'running' | 'idle' | 'stopped' | 'error' | 'maintenance';
  uptimeSeconds: number;
  cpuPercent: number;
  ramPercent: number;
  timestamp: string;
}
