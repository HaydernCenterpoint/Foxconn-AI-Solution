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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../app/i18n';
import { useAuthStore } from '../shared/store/auth.store';
import LoginPage from './LoginPage';

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('../features/auth/services/auth.api', () => ({
  authApi: authApiMock,
}));

vi.mock('../shared/components/ui/TechBackground', () => ({
  TechBackground: () => null,
}));

describe('LoginPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
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

  it('stores a successful shared login and enters the protected admin app', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    authApiMock.login.mockResolvedValue({
      token: 'signed-token',
      username: 'admin',
      role: 'ADMIN',
    });

    render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/login']}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/admin" element={<div data-testid="admin-landing" />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </I18nextProvider>,
    );

    await user.type(screen.getByPlaceholderText('Enter account'), 'admin');
    await user.type(screen.getByPlaceholderText('Enter password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('admin-landing')).toBeInTheDocument();
    expect(authApiMock.login.mock.calls[0]?.[0]).toEqual({ username: 'admin', password: 'secret' });
    await waitFor(() => {
      expect(useAuthStore.getState()).toMatchObject({
        token: 'signed-token',
        username: 'admin',
        role: 'ADMIN',
        isAuthenticated: true,
      });
    });
  });
});
