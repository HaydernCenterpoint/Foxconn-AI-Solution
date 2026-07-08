import { LogOut, PanelLeft, RefreshCw, Wifi, WifiOff, Bell, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import type { RefreshScope } from '../../../app/refresh';
import { routeMetaByPath } from '../../../app/routeMeta';
import { LanguageSelector } from '../i18n/LanguageSelector';
import { useState, useRef, useEffect } from 'react';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';

interface Props {
  isOnline?: boolean;
  refreshScope?: RefreshScope;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
  onToggleSidebar?: () => void;
}

export function Topbar({
  isOnline = true,
  onRefresh,
  isRefreshing = false,
  onToggleSidebar,
}: Props) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { username, role, logout, isAuthenticated } = useAuthStore();
  const { notifications, clearNotifications, sidebarCollapsed } = useUiStore();
  const routeMeta = routeMetaByPath[location.pathname];
  const title = routeMeta ? t(routeMeta.titleKey) : t('common.systemName');

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const currentLang = i18n.language || 'vi';

  const getLocalizedDayAndDate = (date: Date, lang: string) => {
    let locale = 'vi-VN';
    if (lang === 'en') locale = 'en-US';
    else if (lang === 'zh-CN' || lang === 'zh') locale = 'zh-CN';

    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
    const dateStr = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);

    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${capitalizedWeekday}, ${dateStr}`;
  };

  const formattedDayAndDate = getLocalizedDayAndDate(time, currentLang);
  const formattedTime = time.toTimeString().split(' ')[0];

  const getShiftBadge = () => {
    const totalMinutes = time.getHours() * 60 + time.getMinutes();

    if (totalMinutes >= 450 && totalMinutes <= 1110) {
      return {
        label: t('common.time.shiftMorning'),
        className: 'bg-running-container text-running border border-running/25',
      };
    }
    if (totalMinutes >= 1170 || totalMinutes <= 390) {
      return {
        label: t('common.time.shiftNight'),
        className: 'bg-idle-container text-idle border border-idle/25',
      };
    }
    return {
      label: t('common.time.shiftHandover'),
      className: 'bg-warn-container text-warn border border-warn/25',
    };
  };

  const shiftInfo = getShiftBadge();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#14356a] bg-[#060a16] pr-4 lg:pr-6 shadow-[0_4px_20px_rgba(0,0,0,0.4)] sticky top-0 z-40">
      <div className="flex min-w-0 items-center gap-0 h-full">
        {/* Logo FII */}
        <div 
          className="flex h-full items-center justify-center bg-white w-[280px] pr-6 shrink-0" 
          style={{ clipPath: 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' }}
        >
          <img
            src={logoUrl}
            alt="Foxconn Industrial Internet"
            className="h-[30px] w-auto object-contain"
          />
        </div>
        

      </div>

      <div className="flex items-center gap-3">
        {/* Digital Clock Panel (No background frame, simple text clock) */}
        <div className="hidden md:flex items-center gap-2 px-2 mr-1">
          <span className="font-mono text-xl font-bold tracking-widest text-[#20DFF3] drop-shadow-[0_0_8px_rgba(32,223,243,0.3)] select-none">
            {formattedTime}
          </span>
          <div className="w-px h-5 bg-[#14356a]/60 mx-1" />
          <div className="flex flex-col text-[8px] leading-tight text-text-secondary font-black select-none">
            <span>{time.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <span className="text-[#00f0ff] uppercase text-[7px] tracking-wider mt-0.5">
              {time.toLocaleDateString('vi-VN', { weekday: 'long' })}
            </span>
          </div>
        </div>

        {/* Connection status - stacked vertically */}
        <div className="hidden h-9 items-center gap-2 px-3 bg-emerald-500/10 border border-emerald-500/25 rounded-md text-emerald-400 md:flex">
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
          <div className="flex flex-col">
            <span className="text-[7.5px] font-bold text-text-secondary leading-none">KẾT NỐI</span>
            <span className="text-[9.5px] font-black text-[#00E676] leading-none mt-0.5 tracking-wider">ONLINE</span>
          </div>
        </div>

        <div className="h-5 w-px bg-[#14356a] hidden md:block" />

        {/* GROUP 3: Nhóm thao tác nhanh */}
        <div className="flex items-center gap-1.5 bg-[#0A1A35]/50 border border-[#14356a] rounded-lg p-1">
          {/* Refresh Button */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-7.5 w-7.5 items-center justify-center rounded-md text-text-secondary hover:text-[#20DFF3] hover:bg-surface-3 transition-all duration-200 active:scale-90 cursor-pointer"
              title={t('common.aria.refresh')}
              aria-label={t('common.aria.refresh')}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          )}

          {/* Notifications Button */}
          {isAuthenticated && (
            <div ref={notifRef} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-7.5 w-7.5 items-center justify-center rounded-md text-text-secondary hover:text-[#20DFF3] hover:bg-surface-3 transition-all duration-200 active:scale-90 cursor-pointer relative"
                title={t('common.notifications.title')}
              >
                <Bell size={14} />
                {unreadCount > 0 && (
                  <span
                    className="absolute right-0.5 top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full text-[8px] font-bold text-white px-0.5 shadow-[0_0_6px_rgba(244,63,94,0.6)] animate-pulse"
                    style={{ backgroundColor: 'var(--color-error)' }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-[#20DFF3]/35 bg-[#0A2243]/95 backdrop-blur-md shadow-[0_10px_25px_rgba(0,0,0,0.5)] animate-fade-in">
                  <div className="flex items-center justify-between border-b border-border-subtle p-3.5 bg-[#0B2243]/30">
                    <span className="text-xs font-medium uppercase tracking-wider text-[#20DFF3]">{t('common.notifications.title')}</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={clearNotifications}
                        className="text-xs transition-colors hover:underline text-[#20DFF3] font-medium"
                      >
                        {t('common.notifications.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-xs text-text-secondary">{t('common.notifications.empty')}</p>
                      </div>
                    ) : (
                      notifications.slice(0, 6).map((notif) => (
                        <div
                          key={notif.id}
                          className="flex gap-3 border-b border-border-subtle p-3.5 transition-colors hover:bg-[#20DFF3]/10"
                        >
                          <div
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: notif.read ? 'var(--color-outline)' : '#20DFF3' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs leading-snug text-text-primary">{notif.message}</p>
                            <p className="mt-1 text-[10px] text-text-muted">{notif.timestamp}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Language Selector */}
          <LanguageSelector compact />
        </div>

        <div className="h-5 w-px bg-border/20" />

        {/* GROUP 4: Nhóm tài khoản */}
        {isAuthenticated ? (
          <div ref={userMenuRef} className="relative hidden items-center sm:flex">
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-surface-2 transition-all duration-200 cursor-pointer"
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white shadow-[0_0_8px_rgba(32,223,243,0.25)] ${
                  role === 'ADMIN'
                    ? 'bg-gradient-to-tr from-purple-500 to-indigo-600'
                    : 'bg-gradient-to-tr from-teal-400 to-[#20DFF3]'
                }`}
              >
                {username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="hidden max-w-24 truncate text-xs font-semibold lg:block text-text-primary">{username}</span>
              <ChevronDown size={12} className="text-text-muted" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-[#20DFF3]/35 bg-[#0A2243]/98 backdrop-blur-md shadow-[0_10px_25px_rgba(0,0,0,0.5)] animate-fade-in">
                <div className="border-b border-border-subtle p-3.5 bg-[#0B2243]/30">
                  <p className="text-xs font-medium text-white uppercase tracking-wider">{username}</p>
                  <p className="text-[10px] text-text-muted mt-0.5">{role}</p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-rose-500/10 text-error"
                  >
                    <LogOut size={14} />
                    {t('common.aria.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-full bg-[#20DFF3]/10 border border-[#20DFF3]/25 px-3 py-1 text-xs font-medium text-[#20DFF3] select-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[#20DFF3] animate-pulse" />
            {t('common.viewerMode', 'Chế độ xem')}
          </div>
        )}

        {/* Mobile Log Out */}
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => logout()}
            className="flex h-8 w-8 items-center justify-center text-text-secondary hover:text-rose-400 transition-all duration-200 active:scale-90 cursor-pointer sm:hidden"
            title={t('common.aria.logout')}
            aria-label={t('common.aria.logout')}
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
