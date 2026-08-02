import { describe, expect, it } from 'vitest';
import { assertProductionConfig } from './productionConfigGuard';

describe('production configuration guard', () => {
  it.each([
    ['MODE=demo', { MODE: 'demo' }],
    ['VITE_ENABLE_API_MOCKS=true', { VITE_ENABLE_API_MOCKS: 'true' }],
    [
      'MODE=demo, VITE_ENABLE_API_MOCKS=true',
      { MODE: 'demo', VITE_ENABLE_API_MOCKS: ' TRUE ' },
    ],
  ])('blocks a production build when synthetic mode is enabled by %s', (setting, env) => {
    expect(() => assertProductionConfig({ command: 'build', mode: 'production', env })).toThrow(
      `[production-config-guard] Production build blocked: synthetic data is enabled by ${setting}.`,
    );
  });

  it('allows a production build when synthetic mode is disabled', () => {
    expect(() =>
      assertProductionConfig({
        command: 'build',
        mode: 'production',
        env: { MODE: 'production', VITE_ENABLE_API_MOCKS: 'false' },
      }),
    ).not.toThrow();
  });

  it('allows the explicit demo build that carries the synthetic-data banner', () => {
    expect(() =>
      assertProductionConfig({
        command: 'build',
        mode: 'demo',
        env: { MODE: 'demo', VITE_ENABLE_API_MOCKS: 'true' },
      }),
    ).not.toThrow();
  });
});
