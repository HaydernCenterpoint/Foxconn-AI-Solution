import type { ReactNode } from 'react';
import { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronsLeft,
  ChevronsRight,
  Factory,
  Gauge,
  MonitorCog,
  BellOff,
  Users,
  ClipboardList,
  FileText,
  Settings,
  Cpu,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/auth.store';

const baseNavItems = [
  { to: '/admin', icon: Gauge, labelKey: 'navigation.overview', permission: null },
  { to: '/admin/lines', icon: Factory, labelKey: 'navigation.productionLines', permission: null },
  { to: '/admin/machines', icon: MonitorCog, labelKey: 'navigation.equipment', permission: null },
  { to: '/admin/alarms', icon: BellOff, labelKey: 'navigation.alarms', permission: null },
  { to: '/admin/reports', icon: FileText, labelKey: 'navigation.reports', permission: null },
] as const;

const adminNavItems = [
  { to: '/admin/users', icon: Users, labelKey: 'navigation.users', permission: 'ADMIN' as const },
  { to: '/admin/audit-logs', icon: ClipboardList, labelKey: 'navigation.auditLogs', permission: 'ADMIN' as const },
] as const;

const viewerNavItems = [
  { to: '/', icon: Gauge, labelKey: 'navigation.overview', permission: null },
  { to: '/lines', icon: Factory, labelKey: 'navigation.productionLines', permission: null },
  { to: '/alarms', icon: BellOff, labelKey: 'navigation.alarms', permission: null },
  { to: '/production-analysis', icon: FileText, labelKey: 'navigation.productionAnalysis', permission: null },
] as const;



interface Props {
  collapsed: boolean;
  onToggle?: () => void;
  alarmCount?: number;
}

const COLLAPSED_W = '64px';
const EXPANDED_W = '260px';
const HOVER_LEAVE_DELAY = 150;

export function Sidebar({ collapsed, onToggle, alarmCount = 0 }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<number | null>(null);
  const role = useAuthStore(s => s.role);

  const isExpanded = !collapsed || hovered;
  const width = isExpanded ? EXPANDED_W : COLLAPSED_W;

  const isViewerMode = !location.pathname.startsWith('/admin');

  const handleEnter = () => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (collapsed) setHovered(true);
  };

  const handleLeave = () => {
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false);
      leaveTimer.current = null;
    }, HOVER_LEAVE_DELAY);
  };

  const visibleAdminItems = role === 'ADMIN' ? adminNavItems : [];
  const allNavItems = [...baseNavItems, ...visibleAdminItems];

  const renderNavItem = (item: { to: string; icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; labelKey: string }, showBadge?: boolean) => {
    const Icon = item.icon;
    const label = t(item.labelKey);
    return (
      <NavLink
        key={item.labelKey}
        to={item.to}
        end={item.to === '/' || item.to === '/admin'}
        title={!isExpanded ? label : undefined}
        className={({ isActive }) =>
          `group relative flex min-h-[2.85rem] items-center gap-3 rounded-lg px-3.5 text-sm transition-all duration-250 border ${
            isActive 
              ? 'font-bold bg-gradient-to-r from-[#00f0ff]/15 to-[#00f0ff]/1 text-[#00f0ff] border-[#00f0ff]/35 shadow-[0_0_15px_rgba(0,240,255,0.08)]' 
              : 'font-semibold text-text-secondary border-transparent hover:bg-[#0A1A35]/35 hover:text-text-primary hover:border-[#14356a]/30'
          } ${
            !isExpanded ? 'justify-center' : ''
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-[#00f0ff] shadow-[0_0_8px_#00f0ff]" />
            )}
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                isActive ? 'text-[#00f0ff]' : 'text-text-secondary group-hover:text-text-primary'
              }`}
            >
              <Icon size={17} aria-hidden={true} />
            </span>
            {isExpanded && (
              <span className="flex-1 truncate tracking-wide text-xs uppercase font-bold">{label}</span>
            )}
            {isExpanded && showBadge && alarmCount > 0 && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                style={{ backgroundColor: '#8B5CF6' }} // purple count bubble matching mockup
              >
                {alarmCount > 99 ? '99+' : alarmCount}
              </span>
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <div
      className="h-full flex-shrink-0 relative transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? COLLAPSED_W : EXPANDED_W }}
    >
      <aside
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="flex h-full flex-col border-r border-[#14356a] transition-[width] duration-200 ease-out overflow-hidden"
        style={{
          width: isExpanded ? EXPANDED_W : COLLAPSED_W,
          backgroundColor: '#060a16',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: isExpanded && collapsed ? 40 : 'auto',
          boxShadow: isExpanded && collapsed ? 'var(--shadow-3)' : 'none',
        }}
      >
        <nav className="flex-1 space-y-2 p-3">
          {isViewerMode ? (
            viewerNavItems.map(item => renderNavItem(item, item.to === '/alarms'))
          ) : (
            <>
              {baseNavItems.map(item => renderNavItem(item, item.to === '/admin/alarms'))}

              {role === 'ADMIN' && (
                <>
                  {isExpanded && (
                    <div className="mx-3.5 mt-5 mb-2 text-[10px] font-black uppercase tracking-widest text-[#00f0ff]/50">
                      System Admin
                    </div>
                  )}
                  {!isExpanded && <div className="mx-2 my-2 h-px bg-[#14356a]/30" />}
                  {visibleAdminItems.map(item => renderNavItem(item))}
                </>
              )}
            </>
          )}
        </nav>



        {onToggle && (
          <div className="shrink-0 border-t border-[#14356a]/40 p-3 bg-[#040812]">
            <button
              type="button"
              onClick={() => {
                setHovered(false);
                onToggle?.();
              }}
              className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-xs font-bold border border-[#14356a]/40 bg-[#0A1A35]/30 hover:bg-[#00f0ff]/10 hover:text-[#00f0ff] hover:border-[#00f0ff]/30 transition-all duration-200 active:scale-95 cursor-pointer ${
                isExpanded ? 'justify-between' : 'justify-center'
              }`}
              style={{ color: 'var(--color-text-secondary)' }}
              title={t('common.aria.toggleSidebar')}
              aria-label={t('common.aria.toggleSidebar')}
            >
              {isExpanded && <span className="text-[10px] uppercase tracking-wider">{t('common.actions.collapse')}</span>}
              {isExpanded ? <ChevronsLeft size={15} aria-hidden={true} /> : <ChevronsRight size={15} aria-hidden={true} />}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
