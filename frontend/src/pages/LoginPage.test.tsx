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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import { useAuthStore } from '../shared/store/auth.store';
import LoginPage from './LoginPage';

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

  it('keeps the enterprise login shell accessible with exactly three capabilities', () => {
    renderLogin();

    const login = screen.getByRole('main', { name: 'Sign in' });
    expect(login).toHaveClass('login-experience');
    expect(login.parentElement).toHaveClass('min-h-[100dvh]', 'w-full');
    expect(login.parentElement).not.toHaveClass('px-4');
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Foxconn', level: 2, hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sign in' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Forgot password?' })).toHaveLength(1);

    const capabilities = within(screen.getByRole('list', { name: 'Foxconn', hidden: true })).getAllByRole('listitem', {
      hidden: true,
    });
    expect(capabilities).toHaveLength(3);
    expect(capabilities.map((item) => item.textContent)).toEqual([
      'Live production visibility',
      'Equipment health monitoring',
      'Traceable operations',
    ]);
  });

  it('toggles password visibility and exposes the password state to assistive technology', () => {
    renderLogin();

    const password = screen.getByLabelText('Password');
    const visibilityButton = screen.getByRole('button', { name: 'Show password' });
    expect(password).toHaveAttribute('type', 'password');
    expect(visibilityButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(visibilityButton);

    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('validates required credentials and preserves the forgot-password disclosure', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('status')).toHaveTextContent('Please contact the system administrator');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
  });
});
