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

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../shared/store/auth.store';
import { AppRouter } from './router';

vi.mock('../pages/LoginPage', () => ({ default: () => <div data-testid="login-screen" /> }));
vi.mock('../shared/components/layout/AppLayout', () => ({ AppLayout: () => <Outlet /> }));
vi.mock('../shared/components/layout/ViewerLayout', () => ({ default: () => <Outlet /> }));
vi.mock('../pages/viewer/DashboardPage', () => ({ DashboardPage: () => <div data-testid="viewer-dashboard" /> }));
vi.mock('../pages/viewer/SlideshowPage', () => ({ SlideshowPage: () => <div data-testid="slideshow" /> }));

const logout = vi.hoisted(() => vi.fn());
vi.mock('../features/auth/services/auth.api', () => ({ authApi: { logout } }));

function CurrentLocation() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('application authentication boundary', () => {
  beforeEach(() => {
    testStorage.clear();
    logout.mockReset().mockResolvedValue(undefined);
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

  it.each(['/', '/slideshow', '/admin'])('redirects unauthenticated entry %s to login', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter>);

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slideshow')).not.toBeInTheDocument();
  });

  it('clears the authoritative cookie before returning to login', async () => {
    useAuthStore.setState({
      username: 'factory.user',
      role: 'ENGINEER',
      isAuthenticated: true,
      welcomePending: true,
      hasSeenWelcome: false,
    });

    render(
      <MemoryRouter initialEntries={['/logout']}>
        <AppRouter />
        <CurrentLocation />
      </MemoryRouter>,
    );

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'));
    expect(useAuthStore.getState()).toEqual(expect.objectContaining({
      isAuthenticated: false,
      username: null,
      role: null,
      welcomePending: false,
    }));
  });
});
