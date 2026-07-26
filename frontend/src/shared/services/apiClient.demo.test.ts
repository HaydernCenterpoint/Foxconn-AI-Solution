vi.hoisted(() => {
  vi.stubEnv('VITE_ENABLE_API_MOCKS', 'true');
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
});

import { afterAll, describe, expect, it, vi } from 'vitest';
import { api } from './apiClient';
import { getMockDataForUrl } from './apiClient.mock';

describe('demo API mode', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('serves the public walkthrough from synthetic GET data without mocking writes', async () => {
    expect(api.defaults.withCredentials).toBe(true);

    const [dashboard, machine, machineHealth, report, health, documents] = await Promise.all([
      api.get<Record<string, unknown>>('/dashboard/summary'),
      api.get<Record<string, unknown>>('/machines/L1-M1'),
      api.get<Record<string, unknown>>('/machines/L1-M1/health'),
      api.get<Record<string, unknown>>('/reports/query'),
      api.get<Record<string, unknown>>('/health'),
      api.get<Record<string, unknown>[]>('/assets/plant-mkz/documents'),
    ]);

    expect(dashboard.data.totalMachines).toBe(15);
    expect(machine.data.id).toBe('L1-M1');
    expect(machineHealth.data).toEqual(expect.objectContaining({
      machineId: 'L1-M1',
      score: expect.any(Number),
      band: 'healthy',
    }));
    expect(report.data.chartData).toHaveLength(7);
    expect(health.data.status).toBe('Healthy');
    expect(documents.data[0]).toEqual(expect.objectContaining({
      documentId: 'doc-1',
      relationship: expect.any(String),
      createdAt: expect.any(String),
    }));
    expect(getMockDataForUrl('/machines', 'post')).toBeUndefined();
    expect(getMockDataForUrl('/assets', 'post')).toBeUndefined();
    expect(getMockDataForUrl('/auth/login', 'post')).toBeUndefined();
  });
});
