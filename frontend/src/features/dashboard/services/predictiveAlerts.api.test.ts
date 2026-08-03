const testStorage = vi.hoisted(() => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  }

  return storage;
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildRcaRequest,
  isAssetId,
  mapAlertResponse,
  mapHealthResponse,
  mapHealthHistory,
  rollUpHealthScores,
} from './predictiveAlerts.api';

afterEach(() => {
  vi.unstubAllEnvs();
  testStorage.clear();
});

describe('predictiveAlerts API contract mapping', () => {
  it('maps the active backend alert envelope', () => {
    expect(mapAlertResponse({
      alerts: [{
        alertId: 'alert-1',
        assetId: 'asset-1',
        ruleId: 'bearing-temperature',
        openedAt: '2026-07-26T08:00:00Z',
        severity: 'high',
        title: 'Bearing temperature high',
        description: null,
        status: 'open',
        acknowledgedBy: 'engineer',
        acknowledgedAt: '2026-07-26T08:05:00Z',
      }],
    })).toEqual([expect.objectContaining({
      alert_id: 'alert-1',
      asset_id: 'asset-1',
      event_type: 'bearing-temperature',
      description: '',
      acknowledged_by: 'engineer',
    })]);
  });

  it('maps the active backend health breakdown', () => {
    expect(mapHealthResponse({
      assetId: 'asset-1',
      overallScore: 82,
      breakdown: {
        uptime: { value: 98 },
        alarms: { count: 2 },
        performance: { ratio: 91 },
        maintenance: { overdueDays: 3 },
      },
    })).toEqual({
      asset_id: 'asset-1',
      health_score: 82,
      uptime_pct: 98,
      alarm_frequency: 2,
      performance_pct: 91,
      maintenance_overdue: true,
    });
  });

  it('maps camelCase health history responses while retaining legacy fields', () => {
    expect(mapHealthHistory({
      history: [
        { timestamp: '2026-07-28T08:00:00Z', score: 84, metadata: { source: 'health-service' } },
        { recordedAt: '2026-07-27T08:00:00Z', overallScore: 80 },
        { recordedAt: '2026-07-26T08:00:00Z', healthScore: 76 },
      ],
    })).toEqual([
      { recorded_at: '2026-07-28T08:00:00Z', health_score: 84 },
      { recorded_at: '2026-07-27T08:00:00Z', health_score: 80 },
      { recorded_at: '2026-07-26T08:00:00Z', health_score: 76 },
    ]);
  });

  it('accepts the deterministic GUIDs used by the Asset Browser demo', () => {
    expect(isAssetId('00000000-0000-0000-0000-000000000001')).toBe(true);
    expect(isAssetId('L1-M1')).toBe(false);
  });

  it('rolls up worst-child health scores', () => {
    expect(rollUpHealthScores([90, 40, 75])).toBe(40);
    expect(rollUpHealthScores([null, undefined])).toBeNull();
    expect(rollUpHealthScores([])).toBeNull();
  });

  it('submits only the alert identity for server-authoritative RCA context', () => {
    const [alert] = mapAlertResponse({
      alerts: [{
        alertId: 'alert-1',
        assetId: 'asset-from-client',
        ruleId: 'client-rule',
        openedAt: '2026-07-26T08:00:00Z',
        severity: 'high',
        title: 'Client alert',
        evidence: '{"untrusted":true}',
        status: 'open',
      }],
    });

    expect(buildRcaRequest(alert)).toEqual({ alertId: 'alert-1' });
  });

  it('serves deterministic mapped responses in demo mode without a backend', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'demo');
    const { predictiveAlertsApi } = await import('./predictiveAlerts.api');

    const alerts = await predictiveAlertsApi.listAlerts();
    const health = await predictiveAlertsApi.getHealth(alerts[0].asset_id);
    const stats = await predictiveAlertsApi.getStats();
    const rca = await predictiveAlertsApi.getRca(alerts[0]);
    await predictiveAlertsApi.acknowledgeAlert(alerts[0].alert_id);
    await predictiveAlertsApi.resolveAlert(alerts[0].alert_id, 'demo resolve');

    expect(alerts).toEqual([expect.objectContaining({
      alert_id: '00000000-0000-0000-0000-000000000101',
      asset_id: '00000000-0000-0000-0000-000000000001',
      event_type: 'predictive-maintenance',
      severity: 'high',
      recommended_actions: [],
    })]);
    expect(health).toEqual(expect.objectContaining({
      asset_id: '00000000-0000-0000-0000-000000000001',
      health_score: 94.1,
      alarm_frequency: 1,
      maintenance_overdue: true,
    }));
    expect(stats.openCounts.high).toBe(1);
    expect(rca).toEqual({
      rca: expect.objectContaining({
        rca_id: 'demo-rca-0001',
        root_cause_asset_id: '00000000-0000-0000-0000-000000000001',
        confidence_score: 0.84,
        causal_chain: expect.arrayContaining(['demo-event-bearing-temperature']),
        causal_chain_events: expect.arrayContaining([
          expect.objectContaining({
            event_id: 'demo-event-bearing-temperature',
            type: 'bearing_temperature_high',
          }),
        ]),
        recommended_actions: expect.arrayContaining(['Inspect and lubricate the bearing.']),
      }),
    });
  });

  it('filters demo alerts by status and severity', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'demo');
    const { predictiveAlertsApi } = await import('./predictiveAlerts.api');

    const open = await predictiveAlertsApi.listAlerts({ status: 'open' });
    const closed = await predictiveAlertsApi.listAlerts({ status: 'resolved' });
    const high = await predictiveAlertsApi.listAlerts({ severity: 'high' });

    expect(open).toHaveLength(1);
    expect(closed).toHaveLength(0);
    expect(high).toHaveLength(1);
  });
});
