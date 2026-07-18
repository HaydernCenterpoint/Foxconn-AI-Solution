import {
  BellOff,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DatabaseZap,
  Factory,
  FileText,
  Gauge,
  MonitorCog,
  Server,
  Settings,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoUrl from '../../../assets/Foxconn_Industrial_Internet.png';
import { getOpenDataFusionUrl } from '../../config/openDataFusion';
import { IconButton } from '../ui/IconButton';
import { useAuthStore } from '../../store/auth.store';

const baseNavItems = [
  { to: '/admin', icon: Gauge, labelKey: 'navigation.overview' },
  { to: '/admin/lines', icon: Factory, labelKey: 'navigation.productionLines' },
  { to: '/admin/machines', icon: MonitorCog, labelKey: 'navigation.equipment' },
  { to: '/admin/alarms', icon: BellOff, labelKey: 'navigation.alarms' },
  { to: '/admin/reports', icon: FileText, labelKey: 'navigation.reports' },
  { to: '/admin/simulation', icon: MonitorCog, labelKey: 'navigation.simulation' },
  { to: '/admin/system', icon: Server, labelKey: 'navigation.system' },
  { to: '/admin/settings', icon: Settings, labelKey: 'navigation.settings' },
] as const;

const adminNavItems = [
  { to: '/admin/users', icon: Users, labelKey: 'navigation.users' },
  { to: '/admin/audit-logs', icon: ClipboardList, labelKey: 'navigation.auditLogs' },
] as const;

const viewerNavItems = [
  { to: '/', icon: Gauge, labelKey: 'navigation.overview' },
  { to: '/lines', icon: Factory, labelKey: 'navigation.productionLines' },
  { to: '/machines', icon: MonitorCog, labelKey: 'navigation.equipment' },
  { to: '/alarms', icon: BellOff, labelKey: 'navigation.alarms' },
  { to: '/production-analysis', icon: FileText, labelKey: 'navigation.productionAnalysis' },
  { to: '/system', icon: Server, labelKey: 'navigation.system' },
  { to: '/settings', icon: Settings, labelKey: 'navigation.settings' },
] as const;

type NavigationItem = {
  to: string;
  icon: LucideIcon;
  labelKey: string;
};

interface Props {
  collapsed: boolean;
  onToggle?: () => void;
  alarmCount?: number;
  variant?: 'desktop' | 'drawer';
  onClose?: () => void;
  onNavigate?: () => void;
}

export function Sidebar({
  collapsed,
  onToggle,
  alarmCount = 0,
  variant = 'desktop',
  onClose,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const role = useAuthStore((state) => state.role);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isDrawer = variant === 'drawer';
  const isExpanded = isDrawer || !collapsed;
  const isViewerMode = !location.pathname.startsWith('/admin');
  const visibleAdminItems = role === 'ADMIN' ? adminNavItems : [];
  const dataFusionUrl = getOpenDataFusionUrl(
    import.meta.env.VITE_FII_DATA_FUSION_URL?.trim()
      || import.meta.env.VITE_ODF_WEB_URL?.trim()
      || 'http://localhost:5173',
  );
  const assistantUrl = getOpenDataFusionUrl(
    import.meta.env.VITE_ODYSSEUS_URL?.trim() || 'http://localhost:7000',
  );

  useEffect(() => {
    if (!isDrawer) return;

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusableElements = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        drawer.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDrawer]);

  const renderNavItem = (item: NavigationItem, showAlarmCount = false) => {
    const Icon = item.icon;
    const label = t(item.labelKey);

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === '/' || item.to === '/admin'}
        title={!isExpanded ? label : undefined}
        aria-label={label}
        onClick={onNavigate}
        className={({ isActive }) => `app-sidebar__nav-link ${isActive ? 'is-active' : ''} ${!isExpanded ? 'is-collapsed' : ''}`.trim()}
      >
        <span className="app-sidebar__nav-icon"><Icon size={18} aria-hidden="true" /></span>
        {isExpanded && <span className="app-sidebar__nav-label">{label}</span>}
        {isExpanded && showAlarmCount && alarmCount > 0 && (
          <span className="app-sidebar__nav-badge" aria-label={String(alarmCount)}>
            {alarmCount > 99 ? '99+' : alarmCount}
          </span>
        )}
      </NavLink>
    );
  };

  const renderExternalLink = (
    url: string | null,
    labelKey: string,
    Icon: LucideIcon,
  ) => {
    if (!url) return null;
    const label = t(labelKey);

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={!isExpanded ? label : undefined}
        aria-label={label}
        onClick={onNavigate}
        className={`app-sidebar__nav-link ${!isExpanded ? 'is-collapsed' : ''}`.trim()}
      >
        <span className="app-sidebar__nav-icon"><Icon size={18} aria-hidden="true" /></span>
        {isExpanded && <span className="app-sidebar__nav-label">{label}</span>}
      </a>
    );
  };

  return (
    <aside
      ref={drawerRef}
      id={isDrawer ? 'app-sidebar-drawer' : undefined}
      className={`app-sidebar app-sidebar--${variant} ${isExpanded ? 'app-sidebar--expanded' : 'app-sidebar--collapsed'}`}
      role={isDrawer ? 'dialog' : undefined}
      aria-modal={isDrawer || undefined}
      aria-label={isDrawer ? t('common.aria.mainNavigation') : undefined}
      tabIndex={isDrawer ? -1 : undefined}
    >
      <div className="app-sidebar__header">
        <div className="app-sidebar__identity">
          <span className="app-sidebar__logo-frame">
            <img src={logoUrl} alt={t('common.logoAlt')} className="app-sidebar__logo" />
          </span>
          {isExpanded && (
            <span className="app-sidebar__identity-copy">
              <span className="app-sidebar__identity-name">{t('common.appName')}</span>
              <span className="app-sidebar__identity-subtitle">{t('common.systemName')}</span>
            </span>
          )}
        </div>
        {isDrawer && onClose && (
          <IconButton
            ref={closeButtonRef}
            icon={<X size={20} aria-hidden="true" />}
            label={t('common.aria.close')}
            variant="ghost"
            onClick={onClose}
          />
        )}
      </div>

      <nav className="app-sidebar__nav" aria-label={t('common.aria.mainNavigation')}>
        {isViewerMode ? (
          <>
            {viewerNavItems.map((item) => renderNavItem(item, item.to === '/alarms'))}
            {renderExternalLink(dataFusionUrl, 'navigation.fiiDataFusion', DatabaseZap)}
            {renderExternalLink(assistantUrl, 'navigation.fiiAssistant', Bot)}
          </>
        ) : (
          <>
            {baseNavItems.map((item) => renderNavItem(item, item.to === '/admin/alarms'))}
            {renderExternalLink(dataFusionUrl, 'navigation.fiiDataFusion', DatabaseZap)}
            {renderExternalLink(assistantUrl, 'navigation.fiiAssistant', Bot)}
            {visibleAdminItems.length > 0 && (
              <>
                <div className="app-sidebar__divider" role="separator" />
                {visibleAdminItems.map((item) => renderNavItem(item))}
              </>
            )}
          </>
        )}
      </nav>

      {!isDrawer && onToggle && (
        <div className="app-sidebar__footer">
          <button
            type="button"
            className="app-sidebar__collapse-control"
            onClick={onToggle}
            aria-label={t('common.aria.toggleSidebar')}
            title={t('common.aria.toggleSidebar')}
          >
            {isExpanded && <span>{t('common.actions.collapse')}</span>}
            {isExpanded ? <ChevronLeft size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}
          </button>
        </div>
      )}
    </aside>
  );
}
