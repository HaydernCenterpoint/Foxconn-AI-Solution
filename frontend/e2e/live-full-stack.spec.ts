import { expect, test } from '@playwright/test';

const username = process.env.FII_DEMO_USERNAME;
const password = process.env.FII_DEMO_PASSWORD;
const enabled = process.env.FII_LIVE_E2E === '1' && Boolean(username && password);

test.describe('live full-stack', () => {
  test.skip(
    !enabled,
    'Set FII_LIVE_E2E=1 plus FII_DEMO_USERNAME and FII_DEMO_PASSWORD.',
  );

  test('uses the real login cookie, session, API, and dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en');
    });

    await page.goto('/login');
    await page.getByLabel('Account').fill(username!);
    await page.getByLabel('Password').fill(password!);

    const loginResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/api/auth/login'));
    const firstSummary = page.waitForResponse((response) =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname.endsWith('/api/dashboard/summary'));
    await page.getByRole('button', { name: 'Sign in' }).click();

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
  });
});
