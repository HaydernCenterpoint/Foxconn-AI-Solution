import { afterEach, describe, expect, it, vi } from 'vitest';

describe('demo API mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves the public walkthrough from synthetic GET data without mocking writes', async () => {
    vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: vi.fn(),
        getItem: vi.fn(() => null),
        key: vi.fn(() => null),
        length: 0,
        removeItem: vi.fn(),
        setItem: vi.fn(),
      },
    });

    const [{ api }, { getMockDataForUrl }] = await Promise.all([
      import('./apiClient'),
      import('./apiClient.mock'),
    ]);

    expect(api.defaults.withCredentials).toBe(true);

    const [dashboard, machine, report, health] = await Promise.all([
      api.get<Record<string, unknown>>('/dashboard/summary'),
      api.get<Record<string, unknown>>('/machines/L1-M1'),
      api.get<Record<string, unknown>>('/reports/query'),
      api.get<Record<string, unknown>>('/health'),
    ]);

    expect(dashboard.data.totalMachines).toBe(15);
    expect(machine.data.id).toBe('L1-M1');
    expect(report.data.chartData).toHaveLength(7);
    expect(health.data.status).toBe('Healthy');
    expect(getMockDataForUrl('/machines', 'post')).toBeUndefined();
  });
});
