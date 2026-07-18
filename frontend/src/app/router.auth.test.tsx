const testStorage = vi.hoisted(() => {
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

  return storage;
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../shared/store/auth.store';
import { AppRouter } from './router';

vi.mock('../pages/LoginPage', () => ({
  default: () => <div data-testid="login-page" />,
}));

vi.mock('../shared/components/layout/AppLayout', () => ({
  AppLayout: () => <Outlet />,
}));

vi.mock('../shared/components/layout/ViewerLayout', () => ({
  default: () => null,
}));

vi.mock('../pages/viewer/DashboardPage', () => ({
  DashboardPage: () => null,
}));

vi.mock('../pages/viewer/SlideshowPage', () => ({
  SlideshowPage: () => null,
}));

describe('AppRouter authentication gate', () => {
  beforeEach(() => {
    testStorage.clear();
    useAuthStore.setState({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      sessionChecked: true,
      welcomePending: false,
      hasSeenWelcome: true,
      sessionMessage: null,
    });
  });

  it.each([
    '/',
    '/lines',
    '/machines',
    '/alarms',
    '/settings',
    '/production-analysis',
    '/slideshow',
    '/admin',
  ])('redirects unauthenticated access to %s to the shared login', async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppRouter />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
  });
});
