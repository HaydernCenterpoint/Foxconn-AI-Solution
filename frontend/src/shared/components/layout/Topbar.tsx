import { Bell, Eye, LogOut, Menu, Moon, RefreshCw, Sun, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import type { RefreshScope } from '../../../app/refresh';
import { routeMetaByPath } from '../../../app/routeMeta';
import { IconButton } from '../ui/IconButton';
import { LanguageControl } from '../ui/LanguageControl';
import { LocalizedDateTime } from '../ui/LocalizedDateTime';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';

interface Props {
  isOnline?: boolean;
  refreshScope?: RefreshScope;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Topbar({
  isOnline = true,
  onRefresh,
  isRefreshing = false,
  onToggleSidebar,
  isSidebarOpen = false,
  menuButtonRef,
}: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const { username, role, logout, isAuthenticated } = useAuthStore();
  const { notifications, clearNotifications, theme, setTheme } = useUiStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationMenuRef = useRef<HTMLDivElement>(null);
  const routeMeta = routeMetaByPath[location.pathname];
  const title = routeMeta ? t(routeMeta.titleKey) : t('common.systemName');
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const roleLabel = role ? t(`common.role.${role}`, { defaultValue: role }) : t('common.guest');
  const avatarLabel = (username ?? t('common.values.user')).slice(0, 1).toUpperCase();
  const connectionLabel = isOnline ? t('common.status.backendOnline') : t('common.status.backendOffline');

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <header className="app-topbar">
      <div className="app-topbar__leading">
        {onToggleSidebar && (
          <IconButton
            ref={menuButtonRef}
            icon={<Menu size={21} aria-hidden="true" />}
            label={t('common.aria.toggleSidebar')}
            variant="ghost"
            className="app-topbar__menu-button"
            onClick={onToggleSidebar}
            aria-controls="app-sidebar-drawer"
            aria-expanded={isSidebarOpen}
          />
        )}
        <div className="app-topbar__brand">
          <span className="app-topbar__logo-frame">
            <img src={logoUrl} alt={t('common.logoAlt')} className="app-topbar__logo" />
          </span>
          <div className="app-topbar__context">
            <span className="app-topbar__app-name">{t('common.appName')}</span>
            <span className="app-topbar__page-title">{title}</span>
          </div>
        </div>
      </div>

      <div className="app-topbar__actions">
        <LocalizedDateTime className="app-topbar__clock" />
        <div className={`app-topbar__connection ${isOnline ? 'is-online' : 'is-offline'}`} role="status" title={connectionLabel}>
          {isOnline ? <Wifi size={16} aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
          <span>{connectionLabel}</span>
        </div>
        <div className="app-topbar__utility-group">
          {onRefresh && (
            <IconButton
              icon={<RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />}
              label={t('common.aria.refresh')}
              variant="ghost"
              onClick={() => { void onRefresh(); }}
              disabled={isRefreshing}
            />
          )}
          {isAuthenticated && (
            <div ref={notificationMenuRef} className="app-topbar__menu-anchor">
              <IconButton
                icon={<Bell size={17} aria-hidden="true" />}
                label={t('common.notifications.title')}
                variant="ghost"
                onClick={() => {
                  setNotificationsOpen((value) => !value);
                  setUserMenuOpen(false);
                }}
                aria-haspopup="dialog"
                aria-expanded={notificationsOpen}
              />
              {unreadCount > 0 && <span className="app-topbar__notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              {notificationsOpen && (
                <section className="app-topbar__popover app-topbar__notification-popover" role="dialog" aria-label={t('common.notifications.title')}>
                  <div className="app-topbar__popover-header">
                    <span>{t('common.notifications.title')}</span>
                    {unreadCount > 0 && (
                      <button type="button" className="app-topbar__text-action" onClick={clearNotifications}>
                        {t('common.notifications.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div className="app-topbar__notification-list">
                    {notifications.length === 0 ? (
                      <p className="app-topbar__empty-notifications">{t('common.notifications.empty')}</p>
                    ) : (
                      notifications.slice(0, 6).map((notification) => (
                        <div key={notification.id} className={`app-topbar__notification ${notification.read ? 'is-read' : ''}`}>
                          <span className="app-topbar__notification-indicator" aria-hidden="true" />
                          <div>
                            <p>{notification.message}</p>
                            <time>{notification.timestamp}</time>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
          <IconButton
            icon={theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            label={t('settings.appearance.theme')}
            title={t(theme === 'dark' ? 'settings.appearance.light' : 'settings.appearance.dark')}
            variant="ghost"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <LanguageControl compact />
        </div>

        {isAuthenticated ? (
          <div ref={userMenuRef} className="app-topbar__menu-anchor app-topbar__account-anchor">
            <button
              type="button"
              className="app-topbar__account-button"
              onClick={() => {
                setUserMenuOpen((value) => !value);
                setNotificationsOpen(false);
              }}
              aria-label={t('common.aria.userMenu')}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
            >
              <span className="app-topbar__avatar">{avatarLabel}</span>
              <span className="app-topbar__account-copy">
                <span className="app-topbar__account-name">{username}</span>
                <span className="app-topbar__account-role">{roleLabel}</span>
              </span>
            </button>
            {userMenuOpen && (
              <div className="app-topbar__popover app-topbar__user-popover" role="menu">
                <div className="app-topbar__user-summary">
                  <span>{username}</span>
                  <span>{roleLabel}</span>
                </div>
                <button type="button" className="app-topbar__logout-action" onClick={() => logout()} role="menuitem">
                  <LogOut size={17} aria-hidden="true" />
                  <span>{t('common.aria.logout')}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="app-topbar__viewer-indicator">
            <Eye size={16} aria-hidden="true" />
            <span>{t('common.viewerMode')}</span>
          </div>
        )}
        {isAuthenticated && (
          <IconButton
            icon={<LogOut size={17} aria-hidden="true" />}
            label={t('common.aria.logout')}
            variant="ghost"
            className="app-topbar__mobile-logout"
            onClick={() => logout()}
          />
        )}
      </div>
    </header>
  );
}
