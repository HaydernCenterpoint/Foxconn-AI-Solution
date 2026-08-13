import { expect, test, type Page, type Route } from '@playwright/test';

const assetId = '00000000-0000-0000-0000-000000000001';
const alertId = '00000000-0000-0000-0000-000000000101';
const alertTitle = 'Bearing temperature requires attention';

const alert = {
  alertId,
  assetId,
  ruleId: 'bearing-temperature',
  openedAt: '2026-07-28T08:00:00Z',
  severity: 'critical',
  title: alertTitle,
  description: 'Bearing temperature exceeded the safe operating threshold.',
  status: 'open',
  evidence: JSON.stringify({
    metric: 'temperature',
    value: 92.4,
    threshold: 80,
  }),
};

const rcaResponse = {
  rca: {
    rca_id: '00000000-0000-0000-0000-000000000201',
    timestamp: '2026-07-28T08:00:01Z',
    root_cause_event_id: '00000000-0000-0000-0000-000000000202',
    root_cause_type: 'vibration_anomaly',
    root_cause_asset_id: assetId,
    root_cause_description: 'Bearing vibration increased before the temperature alert.',
    causal_chain: [
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000203',
    ],
    causal_chain_events: [{
      event_id: '00000000-0000-0000-0000-000000000202',
      type: 'vibration_anomaly',
      timestamp: '2026-07-28T07:58:00Z',
      asset_id: assetId,
      severity: 'warning',
      payload: { vibration: 8.4 },
    }],
    confidence_score: 0.86,
    recommended_actions: ['Inspect the bearing before the next production run.'],
  },
};

const machine = {
  id: assetId,
  name: 'Press 01',
  machineCode: 'PRESS-01',
  ip: '10.0.0.21',
  status: 'RUNNING',
  plcConnected: true,
  clientId: assetId,
  approvalStatus: 'APPROVED',
  cpuPercent: 21,
  ramPercent: 43,
  uptimeSeconds: 86400,
  sequenceOrder: 1,
  lineNames: 'Line A',
  lastPlcData: {
    sentAt: '2026-07-28T08:00:00Z',
    status: 'RUNNING',
    plcConnected: true,
    production: {
      qty: 120,
      oee: 92,
      uph: 60,
      yieldRate: 98,
    },
  },
};

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installApiFixtures(page: Page) {
  let acknowledged = false;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/session') {
      await fulfillJson(route, { username: 'E2E Admin', role: 'ADMIN' });
      return;
    }

    if (path === '/api/dashboard/summary') {
      await fulfillJson(route, {
        totalLines: 1,
        totalMachines: 1,
        running: 1,
        idle: 0,
        error: 0,
        offline: 0,
        totalProduction: 120,
        activeAlarms: 1,
        plcClientsOnline: 1,
        recentAlarms: [],
        hourlyData: [
          { prodDate: '2026-07-28', prodHour: 7, totalQty: 54 },
          { prodDate: '2026-07-28', prodHour: 8, totalQty: 66 },
        ],
      });
      return;
    }

    if (path === '/api/production-lines') {
      await fulfillJson(route, [{
        id: 'line-a',
        name: 'Line A',
        status: 'active',
        machineCount: 1,
      }]);
      return;
    }

    if (path === `/api/machines/${assetId}/hourly-production`) {
      await fulfillJson(route, [{
        prodDate: '2026-07-28',
        prodHour: 8,
        producedQtyStart: 54,
        producedQtyEnd: 120,
        hourlyQty: 66,
        plcRunTimeStart: 0,
        plcRunTimeEnd: 3600,
        avgCpu: 21,
        avgRam: 43,
        receivedAt: '2026-07-28T08:59:00Z',
      }]);
      return;
    }

    if (path === `/api/machines/${assetId}/health`) {
      await fulfillJson(route, {
        machineId: assetId,
        score: 84,
        band: 'healthy',
        calculatedAt: '2026-07-28T08:00:00Z',
        factors: {
          availability: 98,
          alarmScore: 75,
          performance: 92,
          activeAlarms: 1,
          recentEvents: 2,
          cpu: 21,
          ram: 43,
        },
      });
      return;
    }

    if (path === `/api/machines/${assetId}`) {
      await fulfillJson(route, machine);
      return;
    }

    if (path === '/api/machines') {
      await fulfillJson(route, [machine]);
      return;
    }

    if (path === `/api/asset-service/assets/${assetId}/health/history`) {
      await fulfillJson(route, {
        assetId,
        history: [
          { recordedAt: '2026-07-25T00:00:00Z', overallScore: 71 },
          { recordedAt: '2026-07-26T00:00:00Z', overallScore: 76 },
          { recordedAt: '2026-07-27T00:00:00Z', overallScore: 80 },
          { recordedAt: '2026-07-28T00:00:00Z', overallScore: 84 },
        ],
      });
      return;
    }

    if (path === `/api/asset-service/assets/${assetId}/health`) {
      await fulfillJson(route, {
        assetId,
        overallScore: 84,
        breakdown: {
          uptime: { value: 98 },
          alarms: { count: 1 },
          performance: { ratio: 92 },
          maintenance: { overdueDays: 0 },
        },
      });
      return;
    }

    if (path === `/api/v1/assets/${assetId}/health`) {
      await fulfillJson(route, {
        assetId,
        overallScore: 84,
        colorCode: '#22c55e',
        breakdown: {
          uptime: { value: 98, weight: 30, contribution: 29.4 },
          alarms: { count: 1, weight: 25, contribution: 21 },
          performance: { ratio: 92, weight: 25, contribution: 23 },
          maintenance: { overdueDays: 0, weight: 20, contribution: 20 },
        },
      });
      return;
    }

    if (path === `/api/v1/predictions/risk/${assetId}`) {
      await fulfillJson(route, {
        assetId,
        riskScore: 0.18,
        riskLevel: 'low',
        confidence: 0.91,
        timeWindow: '24h',
        contributingFactors: { vibration: 'stable' },
      });
      return;
    }

    if (path === '/api/v1/rca' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ alertId });
      await fulfillJson(route, rcaResponse);
      return;
    }

    if (path === `/api/v1/alerts/${alertId}/acknowledge` && request.method() === 'POST') {
      acknowledged = true;
      await fulfillJson(route, { success: true });
      return;
    }

    if (path === `/api/v1/alerts/${alertId}`) {
      await fulfillJson(route, {
        ...alert,
        status: acknowledged ? 'acknowledged' : 'open',
        acknowledgedBy: acknowledged ? 'E2E Admin' : null,
      });
      return;
    }

    if (path === '/api/v1/alerts') {
      const requestedStatus = url.searchParams.get('status');
      const alerts = acknowledged && requestedStatus === 'open'
        ? []
        : [{ ...alert, status: acknowledged ? 'acknowledged' : 'open' }];
      await fulfillJson(route, { count: alerts.length, alerts });
      return;
    }

    if (path === '/api/alarms') {
      await fulfillJson(route, []);
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `Unhandled E2E fixture: ${request.method()} ${path}` }),
    });
  });

  return {
    wasAcknowledged: () => acknowledged,
  };
}

test('dashboard alert evidence, machine health history, and acknowledge happy path', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('mkz-auth', JSON.stringify({
      state: {
        token: null,
        username: 'E2E Admin',
        role: 'ADMIN',
        isAuthenticated: true,
        hasSeenWelcome: true,
      },
      version: 0,
    }));
  });
  const fixtures = await installApiFixtures(page);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page).toHaveTitle('Overview | Foxconn');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Predictive alerts' })).toBeVisible();

  const dashboardAlert = page.locator('details').filter({ hasText: alertTitle });
  await dashboardAlert.locator('summary').click();
  await expect(dashboardAlert).toHaveAttribute('open', '');
  await expect(dashboardAlert).toContainText('Bearing temperature exceeded the safe operating threshold.');

  await page.locator('a[href="/admin/alerts"]').first().click();
  await expect(page).toHaveURL(/\/admin\/alerts$/);
  await page.getByRole('button', { name: new RegExp(alertTitle) }).click();
  await expect(page.getByText('Evidence', { exact: true })).toBeVisible();
  await expect(page.getByText('temperature', { exact: true })).toBeVisible();
  await expect(page.getByText('92.4', { exact: true })).toBeVisible();
  await expect(page.getByText(
    'Bearing vibration increased before the temperature alert.',
  )).toBeVisible();
  await expect(page.getByText(
    'Inspect the bearing before the next production run.',
  )).toBeVisible();

  await page.goto(`/admin/machines/${assetId}`);
  await expect(page).toHaveURL(new RegExp(`/admin/machines/${assetId}$`));

  const healthHistory = page.locator('section').filter({ hasText: 'Health history' }).first();
  await expect(healthHistory.getByRole('heading', { name: 'Health history' })).toBeVisible();
  await expect(healthHistory.locator('svg.recharts-surface')).toBeVisible();

  await page.locator('a[href="/admin/alerts"]').first().click();
  const alertRow = page.locator('tr').filter({ hasText: alertTitle });
  await alertRow.getByRole('button', { name: 'Acknowledge' }).click();

  const dialog = page.getByRole('dialog', { name: /Acknowledge Alert/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('Investigating bearing temperature.');
  const acknowledgeRequest = page.waitForRequest((request) =>
    request.method() === 'POST'
    && new URL(request.url()).pathname === `/api/v1/alerts/${alertId}/acknowledge`);
  await dialog.getByRole('button', { name: 'Acknowledge' }).click();
  await acknowledgeRequest;

  await expect(dialog).toBeHidden();
  await expect(page.getByText(alertTitle)).toHaveCount(0);
  expect(fixtures.wasAcknowledged()).toBe(true);
  expect(consoleErrors).toEqual([]);
  await test.info().attach('acknowledged-final-state', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
