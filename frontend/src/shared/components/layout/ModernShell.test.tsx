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
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../app/i18n';
import type { DashboardSummary } from '../../../features/dashboard/services/dashboard.api';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { ModernShell } from './ModernShell';

const dashboardApiMock = vi.hoisted(() => ({ getSummary: vi.fn() }));

function setMobileViewport(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: '(max-width: 760px)',
    onchange: null,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(false),
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue(mediaQuery),
  });

  return {
    change(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
  };
}

vi.mock('../../../features/dashboard/services/dashboard.api', () => ({
  dashboardApi: dashboardApiMock,
}));

const summary: DashboardSummary = {
  totalLines: 3,
  totalMachines: 10,
  running: 8,
  idle: 1,
  error: 1,
  offline: 0,
  totalProduction: 1_200,
  activeAlarms: 3,
  plcClientsOnline: 8,
  recentAlarms: [],
  hourlyData: [],
};

function renderViewerShell() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<ModernShell viewer />}>
              <Route index element={<p>{i18n.t('dashboard.modern.overview')}</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe('ModernShell', () => {
  beforeEach(async () => {
    testStorage.clear();
    setMobileViewport(false);
    await i18n.changeLanguage('en');
    dashboardApiMock.getSummary.mockResolvedValue(summary);
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
    useUiStore.setState({ notifications: [] });
  });

  it('shows the live active-alarm count in navigation instead of UI notification count', async () => {
    useUiStore.setState({
      notifications: [
        {
          id: 'ui-notification',
          type: 'warning',
          message: 'Unrelated client notification',
          timestamp: 'now',
          read: false,
        },
      ],
    });
    const { container } = renderViewerShell();
    const alarmsLink = container.querySelector('a[href="/alarms"]');

    expect(alarmsLink).not.toBeNull();
    await waitFor(() => expect(within(alarmsLink as HTMLAnchorElement).getByText('3')).toBeInTheDocument());
    expect(within(alarmsLink as HTMLAnchorElement).queryByText('1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh data' })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Overview | FII Production Monitoring'));
  });

  it('renders the supplied Foxconn Industrial Internet logo', () => {
    renderViewerShell();

    const logo = screen.getByRole('img', { name: i18n.t('common.logoAlt') });
    expect(logo.getAttribute('src')).toContain('Foxconn_Industrial_Internet');
  });

  it('provides an FII Assistant link to Odysseus', () => {
    renderViewerShell();

    const assistantLink = screen.getByRole('link', { name: 'FII Assistant' });
    expect(assistantLink).toHaveAttribute('href', 'http://localhost:7000');
    expect(assistantLink).toHaveAttribute('target', '_blank');
    expect(assistantLink).toHaveAttribute('rel', 'noreferrer');
  });

  it('reports the backend as offline when the summary request fails', async () => {
    dashboardApiMock.getSummary.mockRejectedValue(new Error('Backend unavailable'));
    const { container } = renderViewerShell();
    const status = container.querySelector('.modern-shell__sidebar-footer');

    expect(status).not.toBeNull();
    await waitFor(
      () => expect(within(status as HTMLElement).getByText('Offline')).toBeInTheDocument(),
      { timeout: 3_000 },
    );
    expect(status).toHaveClass('modern-shell__sidebar-footer--offline');
  });

  it('does not report the backend as online while the summary request is still pending', () => {
    dashboardApiMock.getSummary.mockImplementation(() => new Promise(() => undefined));
    const { container } = renderViewerShell();
    const status = container.querySelector('.modern-shell__sidebar-footer');

    expect(status).not.toBeNull();
    expect(within(status as HTMLElement).getByText('Offline')).toBeInTheDocument();
    expect(status).toHaveClass('modern-shell__sidebar-footer--offline');
  });

  it('keeps slideshow reachable and shows live shift status instead of navigation search', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 15, 7, 30, 15));

    try {
      const { container } = renderViewerShell();
      const shiftStatus = container.querySelector('.modern-shell__shift-status');

      expect(container.querySelector('a[href="/slideshow"]')).not.toBeNull();
      expect(container.querySelector('.modern-shell__language-selector')).not.toBeNull();
      expect(container.querySelector('input[type="search"]')).toBeNull();
      expect(shiftStatus).not.toBeNull();
      expect(shiftStatus).toHaveTextContent('07:30:15');
      expect(shiftStatus).toHaveTextContent('Ca sáng');
      expect(shiftStatus).toHaveTextContent('07:30 – 18:30');
    } finally {
      vi.useRealTimers();
    }
  });

  it('supports keyboard language selection and restores focus to the trigger', async () => {
    renderViewerShell();
    const trigger = screen.getByRole('button', { name: /^EN$/ });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const englishOption = await screen.findByRole('option', { name: 'English EN' });
    await waitFor(() => expect(englishOption).toHaveFocus());
    fireEvent.keyDown(englishOption, { key: 'ArrowUp' });

    const vietnameseOption = screen.getByRole('option', { name: 'Tiếng Việt VI' });
    expect(vietnameseOption).toHaveFocus();
    fireEvent.keyDown(vietnameseOption, { key: 'Enter' });

    await waitFor(() => expect(screen.getByRole('button', { name: /^VI$/ })).toHaveFocus());
  });

  it('focuses and traps the mobile drawer, then restores focus to its trigger on close', async () => {
    const user = userEvent.setup();
    const { container } = renderViewerShell();
    const trigger = container.querySelector<HTMLButtonElement>('.modern-shell__mobile-toggle');
    const sidebar = container.querySelector<HTMLElement>('#modern-shell-navigation');
    const frame = container.querySelector<HTMLElement>('.modern-shell__frame');

    expect(trigger).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(frame).not.toBeNull();

    await user.click(trigger as HTMLButtonElement);

    await waitFor(() => expect(sidebar).toHaveFocus());
    expect(frame).toHaveAttribute('aria-hidden', 'true');
    expect(frame?.inert).toBe(true);

    const firstFocusable = sidebar?.querySelector<HTMLElement>('.modern-shell__close-navigation');
    const lastFocusable = sidebar?.querySelector<HTMLElement>('a[href="http://localhost:7000"]');
    expect(firstFocusable).not.toBeNull();
    expect(lastFocusable).not.toBeNull();

    lastFocusable?.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(firstFocusable).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(frame).not.toHaveAttribute('aria-hidden'));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps the closed mobile drawer out of the accessibility tree and tab order', async () => {
    const viewport = setMobileViewport(true);
    const user = userEvent.setup();
    const { container } = renderViewerShell();
    const trigger = container.querySelector<HTMLButtonElement>('.modern-shell__mobile-toggle');
    const sidebar = container.querySelector<HTMLElement>('#modern-shell-navigation');
    const frame = container.querySelector<HTMLElement>('.modern-shell__frame');

    expect(trigger).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar).toHaveAttribute('inert');

    await user.click(trigger as HTMLButtonElement);

    await waitFor(() => expect(sidebar).not.toHaveAttribute('aria-hidden'));
    expect(sidebar).not.toHaveAttribute('inert');

    act(() => viewport.change(false));

    await waitFor(() => expect(frame).not.toHaveAttribute('aria-hidden'));
    expect(frame?.inert).toBe(false);
    expect(sidebar).not.toHaveClass('modern-shell__sidebar--open');
  });
});
