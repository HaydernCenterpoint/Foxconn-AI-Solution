import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowUpRight,
  Bell,
  Bot,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Clock3,
  DatabaseZap,
  Factory,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorCog,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Tv,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { queryKeys } from '../../../app/queryKeys';
import { queryTimings } from '../../../app/queryOptions';
import { queryClient } from '../../../app/queryClient';
import { routeMetaByPath } from '../../../app/routeMeta';
import { invalidateRefreshScope } from '../../../app/refresh';
import { authApi } from '../../../features/auth/services/auth.api';
import { dashboardApi } from '../../../features/dashboard/services/dashboard.api';
import foxconnLogo from '../../../assets/Foxconn_Industrial_Internet.png';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import './modern-shell.css';

interface ModernShellProps {
  /** Use the public, read-only route map instead of the authenticated admin map. */
  viewer?: boolean;
}

interface ShellNavigationItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

function resolveServiceUrl(envUrl: string | undefined, defaultPort: number): string {
  const trimmed = envUrl?.trim();
  const currentHostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const currentProtocol = typeof window !== 'undefined' && window.location.protocol ? window.location.protocol : 'http:';

  if (!trimmed) {
    return `${currentProtocol}//${currentHostname}:${defaultPort}`;
  }

  try {
    const url = new URL(trimmed);
    if (
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
      currentHostname !== 'localhost' &&
      currentHostname !== '127.0.0.1'
    ) {
      url.hostname = currentHostname;
      url.protocol = currentProtocol;
      return url.toString();
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

const DEMO_MODE = import.meta.env.MODE === 'demo';

const viewerNavigation: ShellNavigationItem[] = [
  { to: '/', labelKey: 'navigation.overview', icon: LayoutDashboard },
  { to: '/lines', labelKey: 'navigation.productionLines', icon: Factory },
  { to: '/machines', labelKey: 'navigation.equipment', icon: MonitorCog },
  { to: '/assets', labelKey: 'assetBrowser.title', icon: DatabaseZap },
  { to: '/alarms', labelKey: 'navigation.alarms', icon: Bell },
  { to: '/alerts', labelKey: 'navigation.alerts', icon: ShieldAlert },
  { to: '/production-analysis', labelKey: 'navigation.productionAnalysis', icon: FileText },
  { to: '/slideshow', labelKey: 'common.mode.slideshow', icon: Tv },
  { to: '/settings', labelKey: 'navigation.settings', icon: Settings2 },
];

const adminNavigation: ShellNavigationItem[] = [
  { to: '/admin', labelKey: 'navigation.overview', icon: LayoutDashboard },
  { to: '/admin/lines', labelKey: 'navigation.productionLines', icon: Factory },
  { to: '/admin/machines', labelKey: 'navigation.equipment', icon: MonitorCog },
  { to: '/admin/assets', labelKey: 'assetBrowser.title', icon: DatabaseZap },
  { to: '/admin/alarms', labelKey: 'navigation.alarms', icon: Bell },
  { to: '/admin/alerts', labelKey: 'navigation.alerts', icon: ShieldAlert },
  { to: '/admin/reports', labelKey: 'navigation.reports', icon: FileText },
  { to: '/admin/system', labelKey: 'titles.system', icon: Activity },
  { to: '/admin/settings', labelKey: 'navigation.settings', icon: Settings2 },
];

const adminOnlyNavigation: ShellNavigationItem[] = [
  { to: '/admin/users', labelKey: 'navigation.users', icon: Users },
  { to: '/admin/audit-logs', labelKey: 'navigation.auditLogs', icon: ClipboardList },
];

const FOCUSABLE_SIDEBAR_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
const MOBILE_NAVIGATION_QUERY = '(max-width: 760px)';

type ShiftTone = 'day' | 'night' | 'handover';

interface ShiftStatus {
  label: string;
  schedule: string;
  tone: ShiftTone;
}

function getShiftStatus(time: Date): ShiftStatus {
  const minutes = time.getHours() * 60 + time.getMinutes();

  if (minutes >= 7 * 60 + 30 && minutes <= 18 * 60 + 30) {
    return { label: 'Ca sáng', schedule: '07:30 – 18:30', tone: 'day' };
  }

  if (minutes >= 19 * 60 + 30 || minutes <= 6 * 60) {
    return { label: 'Ca tối', schedule: '19:30 – 06:00', tone: 'night' };
  }

  return {
    label: 'Giao ca',
    schedule: minutes < 7 * 60 + 30 ? '06:00 – 07:30' : '18:30 – 19:30',
    tone: 'handover',
  };
}

function getFocusableSidebarElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SIDEBAR_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.tabIndex >= 0 &&
      element.getAttribute('aria-hidden') !== 'true',
  );
}

export function ModernShell({ viewer = false }: ModernShellProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const username = useAuthStore((state) => state.username);
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const notifications = useUiStore((state) => state.notifications);
  const clearNotifications = useUiStore((state) => state.clearNotifications);
  const markNotificationRead = useUiStore((state) => state.markNotificationRead);

  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_NAVIGATION_QUERY).matches
      : false,
  );
  const notificationsRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationWasOpenRef = useRef(false);
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
    refetchInterval: queryTimings.appShellSummary,
    retry: 1,
  });

  const routeMeta = useMemo(
    () => routeMetaByPath[location.pathname] ?? { titleKey: 'common.appName', refreshScope: 'all' as const },
    [location.pathname],
  );
  const pageTitle = t(routeMeta.titleKey);

  const displayName = username?.trim() || t('common.guest');
  const initials = useMemo(() => {
    const letters = displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => name.charAt(0));

    return (letters.join('') || 'GU').toUpperCase();
  }, [displayName]);

  const rootPath = viewer ? '/' : '/admin';
  const settingsPath = viewer ? '/settings' : '/admin/settings';
  const navigation = viewer
    ? viewerNavigation
    : [...adminNavigation, ...(role === 'ADMIN' ? adminOnlyNavigation : [])];
  const dataFusionUrl = useMemo(
    () => resolveServiceUrl(import.meta.env.VITE_FII_DATA_FUSION_URL, 58088),
    [],
  );
  const odysseusUrl = useMemo(
    () => resolveServiceUrl(import.meta.env.VITE_ODYSSEUS_URL, 7000),
    [],
  );
  const unreadNotifications = notifications.reduce(
    (count, notification) => count + (notification.read ? 0 : 1),
    0,
  );
  const activeAlarmValue = summaryQuery.data?.activeAlarms;
  const activeAlarmCount = typeof activeAlarmValue === 'number' && Number.isFinite(activeAlarmValue)
    ? Math.max(0, activeAlarmValue)
    : 0;
  const roleLabel = role ? t(`common.role.${role}`) : t('common.guest');
  const displayLocale = i18n.language === 'zh-CN' ? 'zh-CN' : i18n.language === 'en' ? 'en-GB' : 'vi-VN';
  const shiftStatus = useMemo(() => getShiftStatus(currentTime), [currentTime]);
  const formattedDate = useMemo(
    () => currentTime.toLocaleDateString(displayLocale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }),
    [currentTime, displayLocale],
  );
  const formattedTime = useMemo(
    () => currentTime.toLocaleTimeString(displayLocale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    [currentTime, displayLocale],
  );
  const isOnline = summaryQuery.isSuccess;

  useEffect(() => {
    document.title = `${pageTitle} | ${t('common.appTitleSuffix')}`;
  }, [pageTitle, t]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia(MOBILE_NAVIGATION_QUERY);
    const syncViewport = () => {
      setIsMobileViewport(mediaQuery.matches);
      if (!mediaQuery.matches) setMobileNavigationOpen(false);
    };
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    const closePopovers = (event: MouseEvent) => {
      const target = event.target as Node;

      if (!notificationsRef.current?.contains(target)) setNotificationsOpen(false);
      if (!accountRef.current?.contains(target)) setAccountOpen(false);
    };

    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      setMobileNavigationOpen(false);
      setNotificationsOpen(false);
      setAccountOpen(false);
    };

    document.addEventListener('mousedown', closePopovers);
    document.addEventListener('keydown', closeWithEscape);

    return () => {
      document.removeEventListener('mousedown', closePopovers);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;

    if (!mobileNavigationOpen) {
      if (frame) frame.inert = false;

      if (mobileNavigationWasOpenRef.current) {
        mobileNavigationWasOpenRef.current = false;
        window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
      }

      return;
    }

    const sidebar = sidebarRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    mobileNavigationWasOpenRef.current = true;
    if (frame) frame.inert = true;
    document.body.style.overflow = 'hidden';

    const focusSidebar = window.requestAnimationFrame(() => {
      sidebar?.focus({ preventScroll: true });
    });

    const trapSidebarFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !sidebar) return;

      const focusableElements = getFocusableSidebarElements(sidebar);
      if (focusableElements.length === 0) {
        event.preventDefault();
        sidebar.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1) as HTMLElement;
      const activeElement = document.activeElement;

      if (!sidebar.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', trapSidebarFocus);

    return () => {
      window.cancelAnimationFrame(focusSidebar);
      document.removeEventListener('keydown', trapSidebarFocus);
      if (frame) frame.inert = false;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [mobileNavigationOpen]);

  const handleLogout = async () => {
    await authApi.logout().catch(() => undefined);
    logout();
    setAccountOpen(false);
    navigate('/login', { replace: true });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await invalidateRefreshScope(queryClient, routeMeta.refreshScope);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 250);
    }
  };

  return (
    <div className={`modern-shell${viewer ? ' modern-shell--viewer' : ''}`}>
      <a className="modern-shell__skip-link" href="#main-content">
        {t('common.aria.skipToContent')}
      </a>
      <button
        type="button"
        className={`modern-shell__backdrop${mobileNavigationOpen ? ' modern-shell__backdrop--visible' : ''}`}
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setMobileNavigationOpen(false)}
      />

      <aside
        id="modern-shell-navigation"
        ref={sidebarRef}
        tabIndex={-1}
        inert={isMobileViewport && !mobileNavigationOpen}
        aria-hidden={isMobileViewport && !mobileNavigationOpen || undefined}
        className={`modern-shell__sidebar${mobileNavigationOpen ? ' modern-shell__sidebar--open' : ''}`}
      >
        <div className="modern-shell__brand-row">
          <div className="modern-shell__brand">
            <img className="modern-shell__brand-logo" src={foxconnLogo} alt={t('common.logoAlt')} />
          </div>
          <button
            type="button"
            className="modern-shell__close-navigation"
            aria-label={t('common.aria.close')}
            onClick={() => setMobileNavigationOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p className="modern-shell__nav-caption">
          {viewer ? t('common.mode.readOnly') : t('common.appName')}
        </p>

        <nav className="modern-shell__navigation" aria-label={t('common.aria.mainNavigation')}>
          {navigation.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            const isAlarmRoute = item.to.endsWith('/alarms');

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === rootPath}
                title={label}
                aria-label={label}
                className={({ isActive }) =>
                  `modern-shell__nav-link${isActive ? ' modern-shell__nav-link--active' : ''}`
                }
                onClick={() => setMobileNavigationOpen(false)}
              >
                <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className="modern-shell__nav-label">{label}</span>
                {isAlarmRoute && activeAlarmCount > 0 && (
                  <span className="modern-shell__nav-badge" aria-label={`${activeAlarmCount}`}>
                    {activeAlarmCount > 99 ? '99+' : activeAlarmCount}
                  </span>
                )}
              </NavLink>
            );
          })}

          <div className="modern-shell__service-group" aria-label={t('navigation.externalServicesTitle')}>
            <p className="modern-shell__service-group-title">{t('navigation.externalServicesTitle')}</p>

            <a
              className="modern-shell__nav-link modern-shell__nav-link--assistant modern-shell__external-link"
              href={odysseusUrl}
              target="_blank"
              rel="noreferrer"
              title={t('navigation.fiiAssistant')}
              aria-label={t('navigation.fiiAssistant')}
              onClick={() => setMobileNavigationOpen(false)}
            >
              <span className="modern-shell__external-icon-wrap">
                <Bot size={20} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="modern-shell__nav-label-wrap">
                <span className="modern-shell__nav-label">{t('navigation.fiiAssistant')}</span>
                <small className="modern-shell__external-subtitle">{t('navigation.fiiAssistantHint')}</small>
              </span>
              <ArrowUpRight className="modern-shell__nav-external-icon" size={15} strokeWidth={1.9} aria-hidden="true" />
            </a>

            <a
              className="modern-shell__nav-link modern-shell__nav-link--assistant modern-shell__external-link"
              href={dataFusionUrl}
              target="_blank"
              rel="noreferrer"
              title={t('navigation.fiiDataFusion')}
              aria-label={t('navigation.fiiDataFusion')}
              onClick={() => setMobileNavigationOpen(false)}
            >
              <span className="modern-shell__external-icon-wrap">
                <DatabaseZap size={20} strokeWidth={2.1} aria-hidden="true" />
              </span>
              <span className="modern-shell__nav-label-wrap">
                <span className="modern-shell__nav-label">{t('navigation.fiiDataFusion')}</span>
                <small className="modern-shell__external-subtitle">{t('navigation.fiiDataFusionHint')}</small>
              </span>
              <ArrowUpRight className="modern-shell__nav-external-icon" size={15} strokeWidth={1.9} aria-hidden="true" />
            </a>
          </div>

        </nav>

        <div className={`modern-shell__sidebar-footer${isOnline ? '' : ' modern-shell__sidebar-footer--offline'}`} role="status">
          <span className="modern-shell__status-dot" aria-hidden="true" />
          <span>{DEMO_MODE ? 'DEMO · SYNTHETIC DATA' : t(isOnline ? 'common.status.online' : 'common.status.offline')}</span>
        </div>
      </aside>

      <div
        ref={frameRef}
        className="modern-shell__frame"
        aria-hidden={mobileNavigationOpen || undefined}
      >
        <header className="modern-shell__header">
          <button
            type="button"
            ref={mobileToggleRef}
            className="modern-shell__mobile-toggle"
            aria-label={t('common.aria.mainNavigation')}
            aria-controls="modern-shell-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen(true)}
          >
            <Menu size={19} aria-hidden="true" />
          </button>

          <div className="modern-shell__welcome">
            <span>{viewer ? t('common.mode.readOnly') : t('common.appName')}</span>
            <strong>{displayName}</strong>
          </div>

          <div
            className="modern-shell__shift-status"
            aria-label={`${formattedDate}, ${formattedTime}. ${shiftStatus.label}: ${shiftStatus.schedule}`}
          >
            <span className="modern-shell__date">
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
              {formattedDate}
            </span>
            <time className="modern-shell__clock" dateTime={currentTime.toISOString()}>
              <Clock3 size={17} strokeWidth={1.75} aria-hidden="true" />
              {formattedTime}
            </time>
            <span className={`modern-shell__shift modern-shell__shift--${shiftStatus.tone}`}>
              <span className="modern-shell__shift-dot" aria-hidden="true" />
              <span>
                <strong>{shiftStatus.label}</strong>
                <small>{shiftStatus.schedule}</small>
              </span>
            </span>
          </div>

          <div className="modern-shell__header-actions">
            <button
              type="button"
              className={`modern-shell__icon-button${isRefreshing ? ' modern-shell__icon-button--refreshing' : ''}`}
              aria-label={t('common.aria.refresh')}
              aria-busy={isRefreshing}
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
            >
              <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>

            <LanguageSelector compact className="modern-shell__language-selector" />

            <div ref={notificationsRef} className="modern-shell__popover-anchor">
              <button
                type="button"
                className="modern-shell__icon-button"
                aria-label={t('common.notifications.title')}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((open) => !open);
                  setAccountOpen(false);
                }}
              >
                <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
                {unreadNotifications > 0 && (
                  <span className="modern-shell__notification-count" aria-hidden="true">
                    {unreadNotifications > 99 ? '99+' : unreadNotifications}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <section className="modern-shell__popover" aria-label={t('common.notifications.title')}>
                  <div className="modern-shell__popover-heading">
                    <strong>{t('common.notifications.title')}</strong>
                    {unreadNotifications > 0 && (
                      <button type="button" onClick={clearNotifications}>
                        {t('common.notifications.markAllRead')}
                      </button>
                    )}
                  </div>

                  <div className="modern-shell__notification-list">
                    {notifications.length === 0 ? (
                      <p>{t('common.notifications.empty')}</p>
                    ) : (
                      notifications.slice(0, 5).map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={`modern-shell__notification${notification.read ? '' : ' modern-shell__notification--unread'}`}
                          onClick={() => markNotificationRead(notification.id)}
                        >
                          <span>{notification.message}</span>
                          <small>{notification.timestamp}</small>
                        </button>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>

            <div ref={accountRef} className="modern-shell__popover-anchor">
              <button
                type="button"
                className="modern-shell__account-trigger"
                aria-label={t('common.aria.userMenu')}
                aria-expanded={accountOpen}
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setNotificationsOpen(false);
                }}
              >
                <span className="modern-shell__avatar" aria-hidden="true">{initials}</span>
                <span className="modern-shell__account-copy">
                  <strong>{displayName}</strong>
                  <small>{roleLabel}</small>
                </span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>

              {accountOpen && (
                <section className="modern-shell__popover modern-shell__account-popover" aria-label={t('common.aria.userMenu')}>
                  <div className="modern-shell__account-summary">
                    <span className="modern-shell__avatar" aria-hidden="true">{initials}</span>
                    <span>
                      <strong>{displayName}</strong>
                      <small>{roleLabel}</small>
                    </span>
                  </div>

                  <NavLink
                    to={settingsPath}
                    className="modern-shell__account-link"
                    onClick={() => setAccountOpen(false)}
                  >
                    <Settings2 size={16} aria-hidden="true" />
                    <span>{t('navigation.settings')}</span>
                  </NavLink>

                  {role === 'ADMIN' && !viewer && (
                    <NavLink
                      to="/admin/users"
                      className="modern-shell__account-link"
                      onClick={() => setAccountOpen(false)}
                    >
                      <ShieldCheck size={16} aria-hidden="true" />
                      <span>{t('navigation.users')}</span>
                    </NavLink>
                  )}

                  {isAuthenticated && (
                    <button type="button" className="modern-shell__logout" onClick={() => void handleLogout()}>
                      <LogOut size={16} aria-hidden="true" />
                      <span>{t('common.actions.logout')}</span>
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" className="modern-shell__content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default ModernShell;
