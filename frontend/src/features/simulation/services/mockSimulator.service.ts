import { createStore } from 'zustand/vanilla';

export type MachineStatus = 'running' | 'idle' | 'error' | 'maintenance' | 'stopped';

export interface SensorData {
  temperature: number;
  pressure: number;
  vibration: number;
  speed: number;
}

export interface MockMachine {
  id: string;
  name: string;
  lineId: string;
  status: MachineStatus;
  sensors: SensorData;
  productionCount: number;
  errorCount: number;
  displayId?: string;
}

export interface MockLine {
  id: string;
  name: string;
  status: 'running' | 'idle' | 'error' | 'maintenance' | 'stopped';
  machineCount: number;
  runningCount: number;
  errorCount: number;
}

export interface SimulatorState {
  lines: MockLine[];
  machines: MockMachine[];
  alarms: { machineId: string; message: string; severity: 'error' | 'warn' }[];
  throughputHistory: { time: string; value: number }[];
  isRunning: boolean;
  lastUpdated: string;
}

const INITIAL_MACHINES: MockMachine[] = [
  { id: 'L1-M1', name: 'Tram cap lieu 1', lineId: 'line-1', status: 'running', sensors: { temperature: 72, pressure: 3.2, vibration: 0.8, speed: 45 }, productionCount: 1245, errorCount: 0 },
  { id: 'L1-M2', name: 'Robot gan 1', lineId: 'line-1', status: 'running', sensors: { temperature: 45, pressure: 1.5, vibration: 0.3, speed: 12 }, productionCount: 1189, errorCount: 0 },
  { id: 'L1-M3', name: 'May khoan 1', lineId: 'line-1', status: 'idle', sensors: { temperature: 28, pressure: 0, vibration: 0.1, speed: 0 }, productionCount: 456, errorCount: 0 },
  { id: 'L1-M4', name: 'Bang tai 1', lineId: 'line-1', status: 'running', sensors: { temperature: 35, pressure: 0.8, vibration: 0.2, speed: 30 }, productionCount: 1523, errorCount: 0 },
  { id: 'L1-M5', name: 'May rua 1', lineId: 'line-1', status: 'error', sensors: { temperature: 65, pressure: 2.1, vibration: 2.5, speed: 15 }, productionCount: 789, errorCount: 3 },
  { id: 'L2-M1', name: 'Tram cap lieu 2', lineId: 'line-2', status: 'running', sensors: { temperature: 70, pressure: 3.0, vibration: 0.7, speed: 42 }, productionCount: 987, errorCount: 0 },
  { id: 'L2-M2', name: 'Robot gan 2', lineId: 'line-2', status: 'running', sensors: { temperature: 43, pressure: 1.4, vibration: 0.3, speed: 11 }, productionCount: 945, errorCount: 0 },
  { id: 'L2-M3', name: 'May han 1', lineId: 'line-2', status: 'running', sensors: { temperature: 180, pressure: 1.2, vibration: 0.5, speed: 8 }, productionCount: 734, errorCount: 0 },
  { id: 'L2-M4', name: 'Bang tai 2', lineId: 'line-2', status: 'idle', sensors: { temperature: 32, pressure: 0.5, vibration: 0.1, speed: 0 }, productionCount: 234, errorCount: 0 },
  { id: 'L2-M5', name: 'May ep 1', lineId: 'line-2', status: 'maintenance', sensors: { temperature: 25, pressure: 0, vibration: 0.2, speed: 0 }, productionCount: 567, errorCount: 0 },
  { id: 'L3-M1', name: 'Tram cap lieu 3', lineId: 'line-3', status: 'running', sensors: { temperature: 68, pressure: 2.9, vibration: 0.6, speed: 40 }, productionCount: 1567, errorCount: 0 },
  { id: 'L3-M2', name: 'Robot gan 3', lineId: 'line-3', status: 'error', sensors: { temperature: 52, pressure: 1.8, vibration: 3.1, speed: 0 }, productionCount: 423, errorCount: 5 },
  { id: 'L3-M3', name: 'May khoan 2', lineId: 'line-3', status: 'running', sensors: { temperature: 30, pressure: 1.1, vibration: 0.4, speed: 25 }, productionCount: 1123, errorCount: 0 },
  { id: 'L3-M4', name: 'Bang tai 3', lineId: 'line-3', status: 'running', sensors: { temperature: 38, pressure: 0.9, vibration: 0.2, speed: 35 }, productionCount: 1345, errorCount: 0 },
  { id: 'L3-M5', name: 'May dan 1', lineId: 'line-3', status: 'stopped', sensors: { temperature: 22, pressure: 0, vibration: 0, speed: 0 }, productionCount: 0, errorCount: 0 },
];

const INITIAL_LINES: MockLine[] = [
  { id: 'line-1', name: 'Line 1', status: 'error', machineCount: 5, runningCount: 3, errorCount: 1 },
  { id: 'line-2', name: 'Line 2', status: 'running', machineCount: 5, runningCount: 3, errorCount: 0 },
  { id: 'line-3', name: 'Line 3', status: 'error', machineCount: 5, runningCount: 3, errorCount: 1 },
];

function randomWalk(current: number, min: number, max: number, step: number): number {
  const delta = (Math.random() - 0.5) * 2 * step;
  return Math.max(min, Math.min(max, current + delta));
}

function generateInitialThroughput(): { time: string; value: number }[] {
  const now = new Date();
  const data: { time: string; value: number }[] = [];
  let value = 80;

  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 3600000);
    value = randomWalk(value, 50, 120, 10);
    data.push({
      time: `${String(time.getHours()).padStart(2, '0')}:00`,
      value: Math.round(value),
    });
  }
  return data;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

type SimulatorStore = SimulatorState & {
  start: () => void;
  stop: () => void;
  getSnapshot: () => SimulatorState;
};

function createSimulatorStore() {
  const store = createStore<SimulatorStore>((set, get) => ({
    lines: INITIAL_LINES,
    machines: INITIAL_MACHINES,
    alarms: [
      { machineId: 'L1-M5', message: 'Vibration above threshold', severity: 'error' },
      { machineId: 'L3-M2', message: 'Motor overheating', severity: 'error' },
    ],
    throughputHistory: generateInitialThroughput(),
    isRunning: false,
    lastUpdated: new Date().toISOString(),

    start: () => {
      if (intervalId) return;

      intervalId = setInterval(() => {
        set((state) => {
          const now = new Date();
          const timeLabel = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

          const updatedMachines = state.machines.map((machine) => {
            if (machine.status === 'stopped' || machine.status === 'maintenance') {
              return machine;
            }

            let newStatus: MachineStatus = machine.status;
            let newErrorCount = machine.errorCount;

            if (Math.random() < 0.02) {
              const statuses: MachineStatus[] = ['running', 'idle', 'error', 'running', 'running'];
              newStatus = statuses[Math.floor(Math.random() * statuses.length)];
              if (newStatus === 'error' && machine.status !== 'error') {
                newErrorCount += 1;
              }
            }

            return {
              ...machine,
              status: newStatus,
              errorCount: newErrorCount,
              sensors: {
                temperature: randomWalk(machine.sensors.temperature, 20, 200, 5),
                pressure: randomWalk(machine.sensors.pressure, 0, 5, 0.3),
                vibration: randomWalk(machine.sensors.vibration, 0, 5, 0.2),
                speed: randomWalk(machine.sensors.speed, 0, 60, 5),
              },
              productionCount: machine.status === 'running' ? machine.productionCount + Math.floor(Math.random() * 5) : machine.productionCount,
            };
          });

          const updatedLines: MockLine[] = state.lines.map((line) => {
            const lineMachines = updatedMachines.filter((m) => m.lineId === line.id);
            const runningCount = lineMachines.filter((m) => m.status === 'running').length;
            const errorCount = lineMachines.filter((m) => m.status === 'error').length;
            const lineStatus: MockLine['status'] = errorCount > 0 ? 'error' : runningCount === lineMachines.length ? 'running' : runningCount > 0 ? 'running' : 'idle';

            return {
              ...line,
              status: lineStatus,
              runningCount,
              errorCount,
            };
          });

          const updatedAlarms = updatedMachines
            .filter((m) => m.status === 'error')
            .flatMap((m) => {
              const existing = state.alarms.find((a) => a.machineId === m.id);
              if (existing) return [existing];
              const messages = ['Temperature high', 'Vibration above threshold', 'Motor overheating', 'Pressure anomaly'];
              return [{ machineId: m.id, message: messages[Math.floor(Math.random() * messages.length)], severity: 'error' as const }];
            });

          const lastThroughput = state.throughputHistory[state.throughputHistory.length - 1]?.value ?? 80;
          const newThroughput = randomWalk(lastThroughput, 40, 130, 15);
          const updatedHistory = [...state.throughputHistory.slice(-23), { time: timeLabel, value: Math.round(newThroughput) }];

          return {
            machines: updatedMachines,
            lines: updatedLines,
            alarms: updatedAlarms,
            throughputHistory: updatedHistory,
            lastUpdated: now.toISOString(),
          };
        });
      }, 4000);

      set({ isRunning: true });
    },

    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      set({ isRunning: false });
    },

    getSnapshot: () => {
      const state = get();
      return {
        lines: state.lines,
        machines: state.machines,
        alarms: state.alarms,
        throughputHistory: state.throughputHistory,
        isRunning: state.isRunning,
        lastUpdated: state.lastUpdated,
      };
    },
  }));

  return store;
}

export const simulatorStore = createSimulatorStore();

export function computeOEE(state: SimulatorState): number {
  const runningMachines = state.machines.filter((m) => m.status === 'running').length;
  const totalMachines = state.machines.length;
  const availability = totalMachines > 0 ? runningMachines / totalMachines : 0;

  const avgPerformance = state.machines.reduce((acc, m) => {
    if (m.status === 'running') {
      const targetSpeed = 50;
      return acc + Math.min(1, m.sensors.speed / targetSpeed);
    }
    return acc;
  }, 0) / Math.max(1, runningMachines);

  const goodOutput = state.machines.reduce((acc, m) => acc + m.productionCount, 0);
  const totalOutput = goodOutput + state.alarms.length * 10;
  const quality = totalOutput > 0 ? Math.max(0, goodOutput / totalOutput) : 1;

  return Math.round(availability * avgPerformance * quality * 100);
}

export function computeTodayProduction(state: SimulatorState): number {
  return state.machines.reduce((acc, m) => acc + m.productionCount, 0);
}

export function computeActiveAlarms(state: SimulatorState): number {
  return state.alarms.length;
}
