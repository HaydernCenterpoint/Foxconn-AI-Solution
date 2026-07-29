export function getMockDataForUrl(url: string, method: string): unknown {
  const cleanUrl = url.split('?')[0];

  if (method === 'get') {
    if (cleanUrl.endsWith('/integrations/connectors')) {
      return [
        { name: 'erp', status: 'success', last_sync_at: new Date().toISOString(), last_successful_sync: new Date().toISOString(), records_synced: 1240, errors: 0, error_message: null, running: true },
        { name: 'file_watcher', status: 'idle', last_sync_at: new Date().toISOString(), last_successful_sync: new Date().toISOString(), records_synced: 86, errors: 0, error_message: null, running: true },
        { name: 'mes', status: 'unknown', last_sync_at: null, last_successful_sync: null, records_synced: 0, errors: 0, error_message: null, running: false },
      ];
    }

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
      return getAllMockMachines();
    }

    if (cleanUrl.startsWith('/machines/') && cleanUrl.endsWith('/hourly-production')) {
      const machineId = cleanUrl.split('/')[2] || 'L1-M1';
      return getMockHourlyProduction(machineId);
    }

    if (/^\/machines\/[^/]+\/health$/.test(cleanUrl)) {
      const machineId = cleanUrl.split('/')[2] || 'L1-M1';
      return {
        machineId,
        score: 92,
        band: 'healthy',
        calculatedAt: new Date().toISOString(),
        factors: {
          availability: 98,
          alarmScore: 88,
          performance: 91,
          activeAlarms: 1,
          recentEvents: 2,
          cpu: 35,
          ram: 42,
        },
      };
    }

    if (/^\/machines\/[^/]+$/.test(cleanUrl)) {
      const machineId = cleanUrl.split('/')[2] || 'L1-M1';
      return getAllMockMachines().find((machine) => machine.id === machineId);
    }

    if (cleanUrl.endsWith('/dashboard/summary')) {
      const now = new Date();
      const hourlyData = [];
      for (let i = 8; i <= 20; i++) {
        hourlyData.push({
          prodDate: now.toISOString().split('T')[0],
          prodHour: i,
          totalQty: 260 + ((i * 47) % 190)
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
        recentAlarms: getMockAlarms(),
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
      return getMockAlarms();
    }

    if (cleanUrl.endsWith('/reports/query')) {
      return getMockReport();
    }

    if (cleanUrl.endsWith('/assets/tree')) {
      return getMockAssetTree();
    }

    if (cleanUrl.endsWith('/assets')) {
      return getMockAssets();
    }

    if (/\/assets\/[^/]+\/children$/.test(cleanUrl)) {
      const assetId = cleanUrl.split('/').slice(-2)[0];
      return getMockAssetChildren(assetId);
    }

    if (/\/assets\/[^/]+\/ancestors$/.test(cleanUrl)) {
      return [];
    }

    if (/\/assets\/[^/]+\/documents$/.test(cleanUrl)) {
      return getMockAssetDocuments();
    }

    if (cleanUrl.endsWith('/events') || cleanUrl.startsWith('/events')) {
      return getMockEvents();
    }

    if (cleanUrl.endsWith('/event-rules')) {
      return getMockEventRules();
    }

    if (cleanUrl.includes('/telemetry/query')) {
      return getMockTelemetryQuery();
    }

    if (cleanUrl.endsWith('/health')) {
      return {
        status: 'Healthy',
        checks: [
          { name: 'Demo telemetry', status: 'Healthy' },
          { name: 'Demo data store', status: 'Healthy' },
        ],
      };
    }

    if (cleanUrl.endsWith('/telemetry/live') || cleanUrl.endsWith('/telemetry/log')) {
      return getAllMockMachines().slice(0, 6).map((machine) => ({
        clientId: machine.clientId,
        machineName: machine.name,
        ipAddress: machine.ip,
        receivedAt: new Date().toISOString(),
        payload: machine.lastPlcData,
      }));
    }
  }

  return undefined;
}

function getMockMachinesForLine(lineId: string): Record<string, unknown>[] {
  const isL1 = lineId === 'line-1';
  const isL2 = lineId === 'line-2';

  if (isL1) {
    return decorateMachines([
      { id: 'L1-M1', name: 'Trạm cấp liệu 1', machineCode: 'MC-01', ip: '192.168.1.10', status: 'running', plcConnected: true, clientId: 'client-01', approvalStatus: 'APPROVED', cpuPercent: 35, ramPercent: 42, uptimeSeconds: 12450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M2', name: 'Robot gắp 1', machineCode: 'MC-02', ip: '192.168.1.11', status: 'running', plcConnected: true, clientId: 'client-02', approvalStatus: 'APPROVED', cpuPercent: 45, ramPercent: 55, uptimeSeconds: 12450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M3', name: 'Máy khoan 1', machineCode: 'MC-03', ip: '192.168.1.12', status: 'idle', plcConnected: true, clientId: 'client-03', approvalStatus: 'APPROVED', cpuPercent: 12, ramPercent: 28, uptimeSeconds: 4560, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M4', name: 'Băng tải 1', machineCode: 'MC-04', ip: '192.168.1.13', status: 'running', plcConnected: true, clientId: 'client-04', approvalStatus: 'APPROVED', cpuPercent: 20, ramPercent: 35, uptimeSeconds: 15230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' },
      { id: 'L1-M5', name: 'Máy rửa 1', machineCode: 'MC-05', ip: '192.168.1.14', status: 'error', plcConnected: true, clientId: 'client-05', approvalStatus: 'APPROVED', cpuPercent: 65, ramPercent: 78, uptimeSeconds: 7890, lastHeartbeat: new Date().toISOString(), lineNames: 'line-1' }
    ]);
  }
  if (isL2) {
    return decorateMachines([
      { id: 'L2-M1', name: 'Trạm cấp liệu 2', machineCode: 'MC-06', ip: '192.168.2.10', status: 'running', plcConnected: true, clientId: 'client-06', approvalStatus: 'APPROVED', cpuPercent: 30, ramPercent: 40, uptimeSeconds: 9870, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M2', name: 'Robot gắp 2', machineCode: 'MC-07', ip: '192.168.2.11', status: 'running', plcConnected: true, clientId: 'client-07', approvalStatus: 'APPROVED', cpuPercent: 43, ramPercent: 48, uptimeSeconds: 9450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M3', name: 'Máy hàn 1', machineCode: 'MC-08', ip: '192.168.2.12', status: 'running', plcConnected: true, clientId: 'client-08', approvalStatus: 'APPROVED', cpuPercent: 18, ramPercent: 32, uptimeSeconds: 7340, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M4', name: 'Băng tải 2', machineCode: 'MC-09', ip: '192.168.2.13', status: 'idle', plcConnected: true, clientId: 'client-09', approvalStatus: 'APPROVED', cpuPercent: 8, ramPercent: 22, uptimeSeconds: 2340, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' },
      { id: 'L2-M5', name: 'Máy ép 1', machineCode: 'MC-10', ip: '192.168.2.14', status: 'maintenance', plcConnected: true, clientId: 'client-10', approvalStatus: 'APPROVED', cpuPercent: 5, ramPercent: 12, uptimeSeconds: 5670, lastHeartbeat: new Date().toISOString(), lineNames: 'line-2' }
    ]);
  }
  return decorateMachines([
    { id: 'L3-M1', name: 'Trạm cấp liệu 3', machineCode: 'MC-11', ip: '192.168.3.10', status: 'running', plcConnected: true, clientId: 'client-11', approvalStatus: 'APPROVED', cpuPercent: 28, ramPercent: 38, uptimeSeconds: 15670, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M2', name: 'Robot gắp 3', machineCode: 'MC-12', ip: '192.168.3.11', status: 'error', plcConnected: true, clientId: 'client-12', approvalStatus: 'APPROVED', cpuPercent: 52, ramPercent: 64, uptimeSeconds: 4230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M3', name: 'Máy khoan 2', machineCode: 'MC-13', ip: '192.168.3.12', status: 'running', plcConnected: true, clientId: 'client-13', approvalStatus: 'APPROVED', cpuPercent: 25, ramPercent: 30, uptimeSeconds: 11230, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M4', name: 'Băng tải 3', machineCode: 'MC-14', ip: '192.168.3.13', status: 'running', plcConnected: true, clientId: 'client-14', approvalStatus: 'APPROVED', cpuPercent: 15, ramPercent: 20, uptimeSeconds: 13450, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' },
    { id: 'L3-M5', name: 'Máy dán 1', machineCode: 'MC-15', ip: '192.168.3.14', status: 'stopped', plcConnected: true, clientId: 'client-15', approvalStatus: 'APPROVED', cpuPercent: 0, ramPercent: 5, uptimeSeconds: 0, lastHeartbeat: new Date().toISOString(), lineNames: 'line-3' }
  ]);
}

function decorateMachines(machines: Record<string, unknown>[]): Record<string, unknown>[] {
  return machines.map((machine, index) => {
    const status = String(machine.status);
    const isRunning = status === 'running';
    const oee = status === 'error' ? 62 : status === 'idle' ? 76 : status === 'maintenance' ? 70 : isRunning ? 88 + (index % 4) : 55;
    const productionCount = 820 + index * 135;
    const uph = isRunning ? 360 + index * 22 : status === 'idle' ? 120 : 0;
    const yieldRate = status === 'error' ? 92.4 : 98.4 + index * 0.2;

    return {
      ...machine,
      lineId: machine.lineNames,
      sequenceOrder: index + 1,
      lastPlcData: {
        productionCount,
        machineRuntimeSeconds: Number(machine.uptimeSeconds),
        clientUptimeSeconds: Number(machine.uptimeSeconds),
        plcConnected: machine.plcConnected,
        timestamp: new Date().toISOString(),
        machine: {
          cpu: Number(machine.cpuPercent),
          ram: Number(machine.ramPercent),
          uptime: Number(machine.uptimeSeconds),
        },
        production: {
          qty: productionCount,
          runtime: Number(machine.uptimeSeconds),
          oee,
          uph,
          yieldRate,
        },
        tags: {
          temperature: isRunning ? 64 + index * 2 : 31,
          pressure: isRunning ? 3.1 + index * 0.1 : 0.6,
          oee,
          uph,
          yieldRate,
        },
      },
    };
  });
}

function getAllMockMachines(): Record<string, unknown>[] {
  return [
    ...getMockMachinesForLine('line-1'),
    ...getMockMachinesForLine('line-2'),
    ...getMockMachinesForLine('line-3'),
  ];
}

function getMockAlarms(): Record<string, unknown>[] {
  const createdAt = new Date().toISOString();
  return [
    { id: 1, machineId: 'L1-M5', machineName: 'Máy rửa 1', severity: 'CRITICAL', message: 'Rung động vượt ngưỡng an toàn', status: 'ACTIVE', createdAt },
    { id: 2, machineId: 'L3-M2', machineName: 'Robot gắp 3', severity: 'HIGH', message: 'Nhiệt độ động cơ tăng cao', status: 'ACTIVE', createdAt },
  ];
}

function getMockHourlyProduction(machineId: string): Record<string, unknown>[] {
  const today = new Date().toISOString().split('T')[0];
  return Array.from({ length: 10 }, (_, index) => {
    const prodHour = index + 8;
    const producedQtyStart = 1200 + index * 410;
    const hourlyQty = 360 + ((index * 37) % 110);
    return {
      prodDate: today,
      prodHour,
      producedQtyStart,
      producedQtyEnd: producedQtyStart + hourlyQty,
      hourlyQty,
      plcRunTimeStart: index * 3300,
      plcRunTimeEnd: (index + 1) * 3300,
      avgCpu: 28 + (index % 4) * 6,
      avgRam: 41 + (index % 3) * 5,
      receivedAt: new Date().toISOString(),
      machineId,
    };
  });
}

function getMockReport(): Record<string, unknown> {
  const chartData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      date: date.toISOString().split('T')[0],
      hour: `${String(index + 8).padStart(2, '0')}:00`,
      output: 2100 + index * 175,
      target: 3000,
    };
  });

  return {
    summary: {
      avgSpeed: 418,
      machinesCount: 15,
      scrapRate: 1.7,
      totalGood: 18136,
      totalProduction: 18450,
      totalScrap: 314,
      yieldRate: 98.3,
    },
    chartData,
    defectChartData: [
      { name: 'Kích thước', value: 128, color: '#ef4444' },
      { name: 'Bề mặt', value: 86, color: '#f59e0b' },
      { name: 'Mối hàn', value: 61, color: '#eab308' },
      { name: 'Lắp ráp', value: 39, color: '#22c55e' },
    ],
    tableLogs: getAllMockMachines().slice(0, 6).map((machine, index) => ({
      key: String(machine.id),
      no: index + 1,
      lineName: String(machine.lineNames).toUpperCase(),
      machineName: machine.name,
      output: 1180 + index * 95,
      good: 1160 + index * 93,
      scrap: 20 + index * 2,
      status: machine.status,
    })),
  };
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
  const machineNumber = Number(id.match(/\d+$/)?.[0] || 1);
  return {
    machineId: id,
    temperature: status === 'running' ? 62 + machineNumber * 2 : 29,
    pressure: status === 'running' ? 2.8 + machineNumber * 0.12 : 0.6,
    speed: status === 'running' ? 34 + machineNumber * 3 : 0,
    productionCount: 700 + machineNumber * 135,
    status,
    uptimeSeconds: 5200 + machineNumber * 740,
    cpuPercent: status === 'running' ? 24 + machineNumber * 4 : 6,
    ramPercent: status === 'running' ? 36 + machineNumber * 3 : 14,
    timestamp: new Date().toISOString()
  };
}

// ── Asset hierarchy mock data ──────────────────────────────────────────

const PLANT_ID = '00000000-0000-0000-0000-000000000001';
const AREA_IDS = {
  smt: '00000000-0000-0000-0000-000000000010',
  assembly: '00000000-0000-0000-0000-000000000011',
  testingQc: '00000000-0000-0000-0000-000000000012',
  packaging: '00000000-0000-0000-0000-000000000013',
  warehouse: '00000000-0000-0000-0000-000000000014',
};

function getMockAssets(): Record<string, unknown>[] {
  const now = new Date().toISOString();
  const areas = [
    { id: AREA_IDS.smt, type: 'AREA', name: 'SMT Workshop', code: 'area:smt', metadata: { floor: '1F', building: 'B1' }, createdAt: now, updatedAt: now },
    { id: AREA_IDS.assembly, type: 'AREA', name: 'Assembly Workshop', code: 'area:assembly', metadata: { floor: '1F', building: 'B2' }, createdAt: now, updatedAt: now },
    { id: AREA_IDS.testingQc, type: 'AREA', name: 'Testing & QC Zone', code: 'area:testing-qc', metadata: { floor: '2F', building: 'B1' }, createdAt: now, updatedAt: now },
    { id: AREA_IDS.packaging, type: 'AREA', name: 'Packaging & Shipping', code: 'area:packaging', metadata: { floor: '1F', building: 'B3' }, createdAt: now, updatedAt: now },
    { id: AREA_IDS.warehouse, type: 'AREA', name: 'Warehouse', code: 'area:warehouse', metadata: { floor: '1F', building: 'B4' }, createdAt: now, updatedAt: now },
  ];

  const machines = getAllMockMachines().map((m) => ({
    id: m.id,
    type: 'MACHINE',
    name: m.name,
    code: `machine:${m.id}`,
    metadata: { machineCode: m.machineCode, clientId: m.clientId },
    createdAt: now,
    updatedAt: now,
  }));

  return [
    { id: PLANT_ID, type: 'PLANT', name: 'MKZ Factory', code: 'MKZ-PLANT', metadata: {}, createdAt: now, updatedAt: now },
    ...areas,
    ...machines,
  ];
}

function getMockAssetTree(): Record<string, unknown>[] {
  const now = new Date().toISOString();
  const lineIds: Record<string, string> = { 'line-1': 'line-1', 'line-2': 'line-2', 'line-3': 'line-3' };

  const buildLine = (lineId: string, lineName: string, areaId: string) => {
    const machines = getMockMachinesForLine(lineId).map((m) => ({
      id: m.id,
      type: 'MACHINE',
      name: m.name,
      code: `machine:${m.id}`,
      metadata: { machineCode: m.machineCode, clientId: m.clientId },
      createdAt: now,
      updatedAt: now,
      parentId: lineId,
      children: [
        { id: `sensor:temp:${m.id}`, type: 'SENSOR', name: `${m.name} Temperature Sensor`, code: `sensor:temp:${m.id}`, metadata: { unit: '°C', range_min: 0, range_max: 120 }, createdAt: now, updatedAt: now, parentId: m.id, children: [] },
        { id: `sensor:vib:${m.id}`, type: 'SENSOR', name: `${m.name} Vibration Sensor`, code: `sensor:vib:${m.id}`, metadata: { unit: 'Hz', range_min: 0, range_max: 500 }, createdAt: now, updatedAt: now, parentId: m.id, children: [] },
      ],
    }));

    return {
      id: lineId,
      type: 'LINE',
      name: lineName,
      code: `line:${lineId}`,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      parentId: areaId,
      children: machines,
    };
  };

  return [{
    id: PLANT_ID,
    type: 'PLANT',
    name: 'MKZ Factory',
    code: 'MKZ-PLANT',
    metadata: {},
    createdAt: now,
    updatedAt: now,
    parentId: null,
    children: [
      {
        id: AREA_IDS.smt, type: 'AREA', name: 'SMT Workshop', code: 'area:smt',
        metadata: { floor: '1F', building: 'B1' }, createdAt: now, updatedAt: now, parentId: PLANT_ID,
        children: [buildLine(lineIds['line-1'], 'Dây chuyền lắp ráp điện tử (L1)', AREA_IDS.smt)],
      },
      {
        id: AREA_IDS.assembly, type: 'AREA', name: 'Assembly Workshop', code: 'area:assembly',
        metadata: { floor: '1F', building: 'B2' }, createdAt: now, updatedAt: now, parentId: PLANT_ID,
        children: [buildLine(lineIds['line-2'], 'Dây chuyền cơ khí CNC (L2)', AREA_IDS.assembly)],
      },
      {
        id: AREA_IDS.testingQc, type: 'AREA', name: 'Testing & QC Zone', code: 'area:testing-qc',
        metadata: { floor: '2F', building: 'B1' }, createdAt: now, updatedAt: now, parentId: PLANT_ID,
        children: [buildLine(lineIds['line-3'], 'Dây chuyền hoàn thiện & đóng gói (L3)', AREA_IDS.testingQc)],
      },
      {
        id: AREA_IDS.packaging, type: 'AREA', name: 'Packaging & Shipping', code: 'area:packaging',
        metadata: { floor: '1F', building: 'B3' }, createdAt: now, updatedAt: now, parentId: PLANT_ID,
        children: [],
      },
      {
        id: AREA_IDS.warehouse, type: 'AREA', name: 'Warehouse', code: 'area:warehouse',
        metadata: { floor: '1F', building: 'B4' }, createdAt: now, updatedAt: now, parentId: PLANT_ID,
        children: [],
      },
    ],
  }];
}

function getMockAssetChildren(assetId: string): Record<string, unknown>[] {
  const tree = getMockAssetTree();
  const findNode = (nodes: Record<string, unknown>[]): Record<string, unknown>[] | null => {
    for (const node of nodes) {
      if (node.id === assetId) return (node.children as Record<string, unknown>[]) ?? [];
      const children = node.children as Record<string, unknown>[] | undefined;
      if (children) {
        const result = findNode(children);
        if (result) return result;
      }
    }
    return null;
  };
  const found = findNode(tree);
  return (found ?? []).map((node) => {
    const child = { ...node };
    delete child.children;
    delete child.parentId;
    return child;
  });
}

function getMockAssetDocuments() {
  return [
    { documentId: 'doc-1', relationship: 'Maintenance Manual v3.2', createdAt: '2026-07-15T08:00:00Z' },
    { documentId: 'doc-2', relationship: 'Electrical Wiring Diagram', createdAt: '2026-07-10T14:30:00Z' },
    { documentId: 'doc-3', relationship: 'Safety Certification ISO 45001', createdAt: '2026-06-20T09:00:00Z' },
  ];
}

function getMockEvents() {
  const now = Date.now();
  return [
    { eventId: 'evt-1', schemaVersion: 1, timestamp: new Date(now - 120_000).toISOString(), assetId: 'machine-1', eventType: 'THRESHOLD_BREACH', severity: 'CRITICAL', source: 'EventRuleEngine:rule-temp-critical', payload: '{"metric":"temperature","actual_value":87.5,"threshold":85}', correlationId: null },
    { eventId: 'evt-2', schemaVersion: 1, timestamp: new Date(now - 300_000).toISOString(), assetId: 'machine-2', eventType: 'THRESHOLD_BREACH', severity: 'WARNING', source: 'EventRuleEngine:rule-vibration-high', payload: '{"metric":"vibration","actual_value":380,"threshold":350}', correlationId: null },
    { eventId: 'evt-3', schemaVersion: 1, timestamp: new Date(now - 600_000).toISOString(), assetId: 'machine-1', eventType: 'THRESHOLD_BREACH', severity: 'WARNING', source: 'EventRuleEngine:rule-oee-low', payload: '{"metric":"oee","actual_value":58.3,"threshold":65}', correlationId: null },
    { eventId: 'evt-4', schemaVersion: 1, timestamp: new Date(now - 900_000).toISOString(), assetId: 'machine-3', eventType: 'MAINTENANCE_DUE', severity: 'WARNING', source: 'EventRuleEngine:rule-maintenance-overdue', payload: '{"metric":"uptime_seconds","actual_value":1900000}', correlationId: null },
  ];
}

function getMockEventRules() {
  return [
    { id: 'rule-temp-critical', name: 'Temperature Critical Threshold', enabled: true, eventType: 'THRESHOLD_BREACH', severity: 'CRITICAL', condition: { type: 'threshold', metric: 'temperature', operator: '>', value: 85, unit: '°C' }, cooldownSeconds: 300 },
    { id: 'rule-temp-warning', name: 'Temperature Warning', enabled: true, eventType: 'THRESHOLD_BREACH', severity: 'WARNING', condition: { type: 'threshold', metric: 'temperature', operator: '>', value: 70, unit: '°C' }, cooldownSeconds: 600 },
    { id: 'rule-vibration-high', name: 'High Vibration Alert', enabled: true, eventType: 'THRESHOLD_BREACH', severity: 'WARNING', condition: { type: 'threshold', metric: 'vibration', operator: '>', value: 350, unit: 'Hz' }, cooldownSeconds: 300 },
    { id: 'rule-oee-low', name: 'Low OEE Alert', enabled: true, eventType: 'THRESHOLD_BREACH', severity: 'WARNING', condition: { type: 'threshold', metric: 'oee', operator: '<', value: 65, unit: '%' }, cooldownSeconds: 1800 },
  ];
}

function getMockTelemetryQuery() {
  const now = Date.now();
  const points = [];
  for (let i = 0; i < 24; i++) {
    points.push({
      time: new Date(now - (23 - i) * 3600_000).toISOString(),
      assetId: 'machine-1',
      metric: 'production_quantity',
      value: 200 + Math.floor(Math.random() * 100),
      unit: 'pcs',
      source: null,
    });
  }
  return points;
}
