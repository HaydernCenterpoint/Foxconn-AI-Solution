import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'live-full-stack.spec.ts',
  outputDir: join(tmpdir(), 'fii-ai-playwright-live-results'),
  fullyParallel: false,
  reporter: 'line',
  use: {
    baseURL: process.env.FII_LIVE_FRONTEND_URL || 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-live',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
