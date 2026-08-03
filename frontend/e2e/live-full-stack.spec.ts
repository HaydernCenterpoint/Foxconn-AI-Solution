import { expect, test } from '@playwright/test';

const username = process.env.FII_DEMO_USERNAME;
const password = process.env.FII_DEMO_PASSWORD;
const enabled = process.env.FII_LIVE_E2E === '1' && Boolean(username && password);
const liveMachineId = process.env.FII_LIVE_MACHINE_ID;
const liveAlertTitle = process.env.FII_LIVE_ALERT_TITLE;
const optionalWorkflowEnabled = Boolean(liveMachineId && liveAlertTitle);

test.describe('live full-stack', () => {
  test.skip(
    !enabled,
    'Set FII_LIVE_E2E=1 plus FII_DEMO_USERNAME and FII_DEMO_PASSWORD.',
  );

  test('uses the real login cookie, session, API, and dashboard', async ({ page }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) {
        consoleErrors.push(message.text());
      }
    });

    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
    });

    await page.goto('/login');
    await page.getByLabel('Account').fill(username!);
    await page.getByRole('textbox', { name: 'Password' }).fill(password!);

    const loginResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/api/auth/login'));
    const firstSummary = page.waitForResponse((response) =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/dashboard/summary'));
    await page.locator('form.login-form').getByRole('button', { name: 'Sign in' }).click();

    expect((await loginResponse).status()).toBe(200);
    expect((await firstSummary).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page).toHaveTitle('Overview | Foxconn');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    const persistedAuth = await page.evaluate(() => {
      const value = localStorage.getItem('mkz-auth');
      return value ? JSON.parse(value) : null;
    });
    expect(persistedAuth?.state).toEqual({ hasSeenWelcome: true });

    const sessionResponse = page.waitForResponse((response) =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/auth/session'));
    const reloadedSummary = page.waitForResponse((response) =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/dashboard/summary'));
    await page.reload();

    expect((await sessionResponse).status()).toBe(200);
    expect((await reloadedSummary).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin$/);

    if (optionalWorkflowEnabled) {
      await page.goto(`/admin/machines/${liveMachineId}`);
      await expect(page).toHaveURL(new RegExp(`/admin/machines/${liveMachineId}$`));
      await expect(page.getByText('Health Score', { exact: true })).toBeVisible();
      await expect(page.locator('section').filter({ hasText: 'Health history' }).first()).toContainText('Health history');
      await expect(page.locator('svg.recharts-surface').first()).toBeVisible();
      await expect(page.locator('.recharts-line-curve').first()).toBeVisible();

      await page.goto('/admin/alerts');
      await expect(page).toHaveURL(/\/admin\/alerts$/);
      const alertRow = page.locator('tr').filter({ hasText: liveAlertTitle! }).first();
      await expect(alertRow).toBeVisible();

      const acknowledgeResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST'
        && /\/api\/v1\/alerts\/[^/]+\/acknowledge$/.test(new URL(response.url()).pathname));
      await alertRow.getByRole('button', { name: 'Acknowledge' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Acknowledge' }).click();
      expect((await acknowledgeResponse).status()).toBe(200);

      await page.reload();
      await expect(page).toHaveURL(/\/admin\/alerts$/);
      await expect(page.locator('tr').filter({ hasText: liveAlertTitle! })).toHaveCount(0);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
