export function getMockDataForUrl(url: string, method: string): unknown {
  const cleanUrl = url.split('?')[0];

  if (method === 'get') {
    if (cleanUrl.endsWith('/production-lines')) {
      return [
        { id: 'line-1', name: 'Dây chuyền lắp ráp điện tử (L1)', description: 'Lắp ráp bản mạch, linh kiện điện tử', status: 'active', createdAt: '2026-06-15T00:00:00.000Z', machineCount: 5 },
        { id: 'line-2', name: 'Dây chuyền cơ khí CNC (L2)', description: 'Gia công chi tiết máy, khoan, hàn', status: 'active', createdAt: '2026-06-15T00:00:00.000Z', machineCount: 5 },
        { id: 'line-3', name: 'Dây chuyền hoàn thiện & đóng gói (L3)', description: 'Vệ sinh, dán nhãn, đóng gói hộp', status: 'active', createdAt: '2026-06-15T00:00:00.000Z', machineCount: 5 }
      ];
    }

    if (cleanUrl.startsWith('/production-lines/') && cleanUrl.endsWith('/machines')) {
      const parts = cleanUrl.split('/');
      const lineId = parts[2] || 'line-1';
      return getMockMachinesForLine(lineId);
    }

    if (cleanUrl.endsWith('/machines')) {
      return [
        ...getMockMachinesForLine('line-1'),
        ...getMockMachinesForLine('line-2'),
        ...getMockMachinesForLine('line-3')
      ];
    }

    if (cleanUrl.endsWith('/dashboard/summary')) {
      const now = new Date();
      const hourlyData = [];
      for (let i = 8; i <= 20; i++) {
        hourlyData.push({
          prodDate: now.toISOString().split('T')[0],
          prodHour: i,
          totalQty: 200 + Math.floor(Math.random() * 300)
        });
      }
      return {
        totalLines: 3,
        totalMachines: 15,
        running: 9,
        idle: 2,
        error: 2,
        offline: 2,
        totalProduction: 18450,
        activeAlarms: 2,
        plcClientsOnline: 13,
        recentAlarms: [
          { id: 1, machineId: 'L1-M5', machineName: 'Máy rửa 1', severity: 'CRITICAL', message: 'Vibration above threshold', status: 'ACTIVE', createdAt: new Date().toISOString() },
          { id: 2, machineId: 'L3-M2', machineName: 'Robot gắp 3', severity: 'HIGH', message: 'Motor overheating', status: 'ACTIVE', createdAt: new Date().toISOString() }
        ],
        hourlyData
      };
    }

    if (cleanUrl.endsWith('/simulation/all')) {
      return getMockSimulationAll();
    }

    if (cleanUrl.startsWith('/simulation/machines/') && cleanUrl.endsWith('/data')) {
      const parts = cleanUrl.split('/');
      const machineId = parts[3] || 'L1-M1';
      return getMockSimulationForMachine(machineId);
    }

    if (cleanUrl.endsWith('/alarms')) {
      return [
        { id: 1, machineId: 'L1-M5', machineName: 'Máy rửa 1', severity: 'CRITICAL', message: 'Vibration above threshold', status: 'ACTIVE', createdAt: new Date().toISOString() },
        { id: 2, machineId: 'L3-M2', machineName: 'Robot gắp 3', severity: 'HIGH', message: 'Motor overheating', status: 'ACTIVE', createdAt: new Date().toISOString() }
      ];
    }
  }

  return undefined;
}

function getMockMachinesForLine(lineId: string): Record<string, unknown>[] {
  const isL1 = lineId === 'line-1';
  const isL2 = lineId === 'line-2';

  if (isL1) {
    return [
      { id: 'L1-M1', name: 'Trạm cấp liệu 1', machineCode: 'MC-01', ip: '192.168.1.10', status: 'running', plcConnected: true, clientId: 'client-01', approvalStatus: 'APPROVED', cpuPercent: 35, ramPercent: 42, uptimeSeconds: 12450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M2', name: 'Robot gắp 1', machineCode: 'MC-02', ip: '192.168.1.11', status: 'running', plcConnected: true, clientId: 'client-02', approvalStatus: 'APPROVED', cpuPercent: 45, ramPercent: 55, uptimeSeconds: 12450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M3', name: 'Máy khoan 1', machineCode: 'MC-03', ip: '192.168.1.12', status: 'idle', plcConnected: true, clientId: 'client-03', approvalStatus: 'APPROVED', cpuPercent: 12, ramPercent: 28, uptimeSeconds: 4560, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M4', name: 'Băng tải 1', machineCode: 'MC-04', ip: '192.168.1.13', status: 'running', plcConnected: true, clientId: 'client-04', approvalStatus: 'APPROVED', cpuPercent: 20, ramPercent: 35, uptimeSeconds: 15230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M5', name: 'Máy rửa 1', machineCode: 'MC-05', ip: '192.168.1.14', status: 'error', plcConnected: true, clientId: 'client-05', approvalStatus: 'APPROVED', cpuPercent: 65, ramPercent: 78, uptimeSeconds: 7890, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' }
    ];
  }
  if (isL2) {
    return [
      { id: 'L2-M1', name: 'Trạm cấp liệu 2', machineCode: 'MC-06', ip: '192.168.2.10', status: 'running', plcConnected: true, clientId: 'client-06', approvalStatus: 'APPROVED', cpuPercent: 30, ramPercent: 40, uptimeSeconds: 9870, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M2', name: 'Robot gắp 2', machineCode: 'MC-07', ip: '192.168.2.11', status: 'running', plcConnected: true, clientId: 'client-07', approvalStatus: 'APPROVED', cpuPercent: 43, ramPercent: 48, uptimeSeconds: 9450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M3', name: 'Máy hàn 1', machineCode: 'MC-08', ip: '192.168.2.12', status: 'running', plcConnected: true, clientId: 'client-08', approvalStatus: 'APPROVED', cpuPercent: 18, ramPercent: 32, uptimeSeconds: 7340, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M4', name: 'Băng tải 2', machineCode: 'MC-09', ip: '192.168.2.13', status: 'idle', plcConnected: true, clientId: 'client-09', approvalStatus: 'APPROVED', cpuPercent: 8, ramPercent: 22, uptimeSeconds: 2340, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M5', name: 'Máy ép 1', machineCode: 'MC-10', ip: '192.168.2.14', status: 'maintenance', plcConnected: true, clientId: 'client-10', approvalStatus: 'APPROVED', cpuPercent: 5, ramPercent: 12, uptimeSeconds: 5670, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' }
    ];
  }
  return [
    { id: 'L3-M1', name: 'Trạm cấp liệu 3', machineCode: 'MC-11', ip: '192.168.3.10', status: 'running', plcConnected: true, clientId: 'client-11', approvalStatus: 'APPROVED', cpuPercent: 28, ramPercent: 38, uptimeSeconds: 15670, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M2', name: 'Robot gắp 3', machineCode: 'MC-12', ip: '192.168.3.11', status: 'error', plcConnected: true, clientId: 'client-12', approvalStatus: 'APPROVED', cpuPercent: 52, ramPercent: 64, uptimeSeconds: 4230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M3', name: 'Máy khoan 2', machineCode: 'MC-13', ip: '192.168.3.12', status: 'running', plcConnected: true, clientId: 'client-13', approvalStatus: 'APPROVED', cpuPercent: 25, ramPercent: 30, uptimeSeconds: 11230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M4', name: 'Băng tải 3', machineCode: 'MC-14', ip: '192.168.3.13', status: 'running', plcConnected: true, clientId: 'client-14', approvalStatus: 'APPROVED', cpuPercent: 15, ramPercent: 20, uptimeSeconds: 13450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M5', name: 'Máy dán 1', machineCode: 'MC-15', ip: '192.168.3.14', status: 'stopped', plcConnected: true, clientId: 'client-15', approvalStatus: 'APPROVED', cpuPercent: 0, ramPercent: 5, uptimeSeconds: 0, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' }
  ];
}

function getMockSimulationAll(): Record<string, Record<string, unknown>> {
  const map: Record<string, Record<string, unknown>> = {};
  const allMachines = [
    ...getMockMachinesForLine('line-1'),
    ...getMockMachinesForLine('line-2'),
    ...getMockMachinesForLine('line-3')
  ];
  allMachines.forEach(m => {
    const id = String(m.id);
    map[id] = getMockSimulationForMachine(id);
  });
  return map;
}

function getMockSimulationForMachine(id: string): Record<string, unknown> {
  const status = id === 'L1-M5' || id === 'L3-M2' ? 'error' : id === 'L1-M3' || id === 'L2-M4' ? 'idle' : 'running';
  return {
    machineId: id,
    temperature: status === 'running' ? 60 + Math.random() * 20 : 25 + Math.random() * 5,
    pressure: status === 'running' ? 2.5 + Math.random() * 1.5 : 0.5 + Math.random() * 0.5,
    speed: status === 'running' ? 30 + Math.random() * 25 : 0,
    productionCount: 500 + Math.floor(Math.random() * 1000),
    status,
    uptimeSeconds: 5000 + Math.floor(Math.random() * 5000),
    cpuPercent: status === 'running' ? 20 + Math.random() * 40 : 2 + Math.random() * 5,
    ramPercent: status === 'running' ? 30 + Math.random() * 30 : 10 + Math.random() * 5,
    timestamp: new Date().toISOString()
  };
}
