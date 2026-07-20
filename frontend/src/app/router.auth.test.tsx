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

vi.mock('../pages/LoginPage', () => ({ default: () => <div data-testid="login-screen" /> }));
vi.mock('../shared/components/layout/AppLayout', () => ({ AppLayout: () => <Outlet /> }));
vi.mock('../shared/components/layout/ViewerLayout', () => ({ default: () => <Outlet /> }));
vi.mock('../pages/viewer/DashboardPage', () => ({ DashboardPage: () => <div data-testid="viewer-dashboard" /> }));
vi.mock('../pages/viewer/SlideshowPage', () => ({ SlideshowPage: () => <div data-testid="slideshow" /> }));

describe('application authentication boundary', () => {
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

  it.each(['/', '/slideshow', '/admin'])('redirects unauthenticated entry %s to login', async (path) => {
    render(<MemoryRouter initialEntries={[path]}><AppRouter /></MemoryRouter>);

    expect(await screen.findByTestId('login-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('viewer-dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('slideshow')).not.toBeInTheDocument();
  });
});
