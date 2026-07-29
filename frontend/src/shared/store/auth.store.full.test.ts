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

it('does not retain the login bearer token in browser state or localStorage', async () => {
  vi.stubEnv('MODE', 'full');
  const { useAuthStore } = await import('./auth.store');

  useAuthStore.getState().login('sensitive-bearer-token', 'factory.user', 'ENGINEER');

  expect(useAuthStore.getState()).toEqual(expect.objectContaining({
    token: null,
    username: 'factory.user',
    role: 'ENGINEER',
    isAuthenticated: true,
  }));
  const persisted = JSON.parse(localStorage.getItem('mkz-auth') ?? '{}');
  expect(persisted.state).toEqual({ hasSeenWelcome: false });
});

it('migrates legacy persisted tokens to a cookie-validated session', async () => {
  vi.stubEnv('MODE', 'full');
  localStorage.setItem('mkz-auth', JSON.stringify({
    version: 0,
    state: {
      token: 'legacy-sensitive-token',
      username: 'forged-admin',
      role: 'ADMIN',
      isAuthenticated: true,
      hasSeenWelcome: true,
    },
  }));
  getSession.mockResolvedValue({
    username: 'factory.guest',
    role: 'GUEST',
    expiresAt: 1_900_000_000,
  });
  const { useAuthStore } = await import('./auth.store');

  await useAuthStore.getState().checkSession();

  expect(getSession).toHaveBeenCalledOnce();
  expect(useAuthStore.getState()).toEqual(expect.objectContaining({
    token: null,
    username: 'factory.guest',
    role: 'GUEST',
    isAuthenticated: true,
  }));
  expect(localStorage.getItem('mkz-auth')).not.toContain('legacy-sensitive-token');
});
