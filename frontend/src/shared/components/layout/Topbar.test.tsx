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
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../app/i18n';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { Topbar } from './Topbar';

const authApiMock = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock('../../../features/auth/services/auth.api', () => ({
  authApi: authApiMock,
}));

describe('Topbar shared logout', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    testStorage.clear();
    await i18n.changeLanguage('en');
    authApiMock.logout.mockResolvedValue(undefined);
    useAuthStore.setState({
      token: 'signed-token',
      username: 'admin',
      role: 'ADMIN',
      isAuthenticated: true,
      sessionChecked: true,
      welcomePending: false,
      hasSeenWelcome: true,
      sessionMessage: null,
    });
    useUiStore.setState({ notifications: [], toasts: [], theme: 'dark' });
  });

  it('clears local auth and warns when shared-session logout fails', async () => {
    const user = userEvent.setup();
    authApiMock.logout.mockRejectedValue(new Error('Backend unavailable'));

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Topbar />} />
            <Route path="/login" element={<div data-testid="login-page" />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(authApiMock.logout).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useUiStore.getState().toasts).toContainEqual(expect.objectContaining({
        type: 'error',
        message: 'Server logout did not complete. The shared session may remain active until it expires.',
      }));
    });
  });
});
