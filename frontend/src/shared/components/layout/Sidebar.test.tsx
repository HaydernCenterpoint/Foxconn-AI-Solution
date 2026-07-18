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
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../app/i18n';
import { useAuthStore } from '../../store/auth.store';
import { Sidebar } from './Sidebar';

describe('Sidebar FII launchers', () => {
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

  it('shows FII Data Fusion before FII Assistant and opens both externally', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Sidebar collapsed={false} />
        </MemoryRouter>
      </I18nextProvider>,
    );

    const links = screen.getAllByRole('link');
    const dataFusionLink = screen.getByRole('link', { name: 'FII Data Fusion' });
    const assistantLink = screen.getByRole('link', { name: 'FII Assistant' });

    expect(dataFusionLink).toHaveAttribute('href', 'http://localhost:5173/');
    expect(dataFusionLink).toHaveAttribute('target', '_blank');
    expect(dataFusionLink).toHaveAttribute('rel', 'noreferrer');
    expect(assistantLink).toHaveAttribute('href', 'http://localhost:7000/');
    expect(assistantLink).toHaveAttribute('target', '_blank');
    expect(assistantLink).toHaveAttribute('rel', 'noreferrer');
    expect(links.indexOf(dataFusionLink)).toBeLessThan(links.indexOf(assistantLink));
  });
});
