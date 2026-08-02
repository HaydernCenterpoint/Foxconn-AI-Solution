import { afterEach, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('../../features/auth/services/auth.api', () => ({
  authApi: { getSession },
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  getSession.mockReset();
  localStorage.clear();
});

it('opens demo mode with an explicit synthetic viewer session', async () => {
  vi.stubEnv('MODE', 'demo');
  const { useAuthStore } = await import('./auth.store');

  await useAuthStore.getState().checkSession();

  expect(getSession).not.toHaveBeenCalled();
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({
    token: null,
    username: 'Demo Viewer',
    role: 'GUEST',
    isAuthenticated: true,
    sessionChecked: true,
    welcomePending: false,
  }));
});
