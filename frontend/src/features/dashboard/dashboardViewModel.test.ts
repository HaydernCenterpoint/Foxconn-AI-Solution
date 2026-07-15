import { describe, expect, it } from 'vitest';
import { createDashboardViewModel } from './dashboardViewModel';

describe('createDashboardViewModel', () => {
  it('maps live dashboard data into the new dashboard sections without inventing product data', () => {
    const viewModel = createDashboardViewModel({
      summary: {
        totalLines: 2,
        totalMachines: 4,
        running: 3,
        idle: 1,
        error: 0,
        offline: 0,
        totalProduction: 1_200,
        activeAlarms: 2,
        plcClientsOnline: 3,
        recentAlarms: [
          {
            id: 1002,
            machineId: 'machine-2',
            machineName: 'Welder B',
            severity: 'HIGH',
            message: 'Temperature exceeded limit',
            status: 'ACTIVE',
            createdAt: '2026-07-14T10:00:00Z',
          },
          {
            id: 1001,
            machineId: 'machine-1',
            machineName: 'Press A',
            severity: 'LOW',
            message: 'Material low',
            status: 'ACKNOWLEDGED',
            createdAt: '2026-07-14T09:00:00Z',
          },
        ],
        hourlyData: [
          { prodDate: '2026-07-14', prodHour: 8, totalQty: 20 },
          { prodDate: '2026-07-14', prodHour: 9, totalQty: 35 },
          { prodDate: '2026-07-14', prodHour: 10, totalQty: 40 },
        ],
      },
      machines: [
        {
          id: 'machine-1',
          name: 'Press A',
          status: 'running',
          lineNames: 'Assembly',
          lastPlcData: { production: { qty: 400, runtime: 100, yieldRate: 95, oee: 80 } },
        },
        {
          id: 'machine-2',
          name: 'Welder B',
          status: 'error',
          lineNames: 'Assembly',
          lastPlcData: { production: { qty: 300, runtime: 80, yieldRate: 85, oee: 70 } },
        },
        {
          id: 'machine-3',
          name: 'Inspection C',
          status: 'idle',
          lineId: 'line-2',
          lastPlcData: { production: { qty: 200, runtime: 60, yieldRate: 100, oee: 90 } },
        },
      ],
      lines: [
        { id: 'line-1', name: 'Assembly', status: 'active' },
        { id: 'line-2', name: 'Quality', status: 'inactive' },
      ],
    });

    expect(viewModel.kpis).toEqual([
      { id: 'total-production', value: 1_200, unit: 'units' },
      { id: 'production-efficiency', value: 80, unit: '%' },
      { id: 'active-alarms', value: 2, unit: 'alarms' },
    ]);
    expect(viewModel.stockBars).toHaveLength(12);
    expect(viewModel.stockBars.at(-1)).toMatchObject({ name: '10:00', current: 40, threshold: 40 });
    expect(viewModel.defects).toMatchObject({
      total: 80,
      rate: 6.7,
      nonDefectiveTotal: 1_120,
      nonDefectiveRate: 93.3,
    });
    expect(viewModel.trend).toHaveLength(12);
    expect(viewModel.trend.at(-1)).toMatchObject({ name: '10:00', production: 40, waste: 3 });
    expect(viewModel.lineStatuses).toEqual([
      expect.objectContaining({ id: 'line-1', name: 'Assembly', status: 'error', machineCount: 2, producedQuantity: 700 }),
      expect.objectContaining({ id: 'line-2', name: 'Quality', status: 'idle', machineCount: 1, producedQuantity: 200 }),
    ]);
    expect(viewModel.pendingOrders).toEqual([
      expect.objectContaining({ id: '1002', machineName: 'Welder B', status: 'ACTIVE' }),
      expect.objectContaining({ id: '1001', machineName: 'Press A', status: 'ACKNOWLEDGED' }),
    ]);
    expect(viewModel.topProducts).toEqual([
      { id: 'machine-1', name: 'Press A', quantity: 400 },
      { id: 'machine-2', name: 'Welder B', quantity: 300 },
      { id: 'machine-3', name: 'Inspection C', quantity: 200 },
    ]);
  });

  it('keeps low percentage readings intact and excludes unapproved machines', () => {
    const viewModel = createDashboardViewModel({
      machines: [
        {
          id: 'approved-running',
          name: 'Approved running machine',
          status: 'running',
          approvalStatus: 'APPROVED',
          lineId: 'line-1',
          lastPlcData: { production: { qty: 100, runtime: 0, yieldRate: 99.5, oee: 0.5 } },
        },
        {
          id: 'approved-offline',
          name: 'Approved offline machine',
          status: 'offline',
          approvalStatus: 'APPROVED',
          lineId: 'line-1',
          lastPlcData: { production: { qty: 50, runtime: 0, yieldRate: 99, oee: 1 } },
        },
        {
          id: 'rejected-machine',
          name: 'Rejected machine',
          status: 'error',
          approvalStatus: 'REJECTED',
          lineId: 'line-1',
          lastPlcData: { production: { qty: 10_000, runtime: 0, yieldRate: 0, oee: 100 } },
        },
      ],
      lines: [{ id: 'line-1', name: 'Assembly', status: 'inactive' }],
    });

    expect(viewModel.kpis).toEqual([
      { id: 'total-production', value: 150, unit: 'units' },
      { id: 'production-efficiency', value: 0.8, unit: '%' },
      { id: 'active-alarms', value: 0, unit: 'alarms' },
    ]);
    expect(viewModel.defects).toMatchObject({ total: 1, rate: 0.8, nonDefectiveTotal: 149 });
    expect(viewModel.lineStatuses).toEqual([
      expect.objectContaining({ id: 'line-1', status: 'active', machineCount: 2, producedQuantity: 150 }),
    ]);
    expect(viewModel.topProducts.map((product) => product.id)).toEqual([
      'approved-running',
      'approved-offline',
    ]);
  });
});
