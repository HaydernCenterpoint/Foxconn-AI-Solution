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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import { useAuthStore } from '../shared/store/auth.store';
import LoginPage from './LoginPage';

vi.mock('@gsap/react', () => ({ useGSAP: vi.fn() }));
vi.mock('gsap', () => ({ default: { registerPlugin: vi.fn() } }));
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(async () => {
    testStorage.clear();
    await i18n.changeLanguage('en');
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

  it('keeps the redesigned login shell accessible and validates required credentials', async () => {
    renderLogin();

    const login = screen.getByRole('main', { name: 'FII Production Monitoring' });
    expect(login).toHaveClass('grid-flow-dense');
    expect(login.parentElement).toHaveClass('min-h-[100dvh]', 'w-full');
    expect(login.parentElement).not.toHaveClass('px-4');
    expect(screen.getByRole('heading', { name: 'Sign in', level: 2 })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Forgot password?' })[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Please contact the system administrator');

    const signInButtons = screen.getAllByRole('button', { name: 'Sign in' });
    fireEvent.click(signInButtons[signInButtons.length - 1]);

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  });
});
