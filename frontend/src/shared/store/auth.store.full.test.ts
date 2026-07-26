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

it('hydrates a full-mode session from the shared HttpOnly cookie', async () => {
  vi.stubEnv('MODE', 'full');
  getSession.mockResolvedValue({
    username: 'factory.user',
    role: 'ENGINEER',
    expiresAt: 1_900_000_000,
  });
  const { useAuthStore } = await import('./auth.store');

  await useAuthStore.getState().checkSession();

  expect(getSession).toHaveBeenCalledOnce();
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({
    token: null,
    username: 'factory.user',
    role: 'ENGINEER',
    isAuthenticated: true,
    sessionChecked: true,
  }));
});

it('fails closed when no persisted token or shared cookie is valid', async () => {
  vi.stubEnv('MODE', 'full');
  getSession.mockRejectedValue(new Error('unauthorized'));
  const { useAuthStore } = await import('./auth.store');

  await useAuthStore.getState().checkSession();

  expect(useAuthStore.getState()).toEqual(expect.objectContaining({
    token: null,
    username: null,
    role: null,
    isAuthenticated: false,
    sessionChecked: true,
  }));
});
