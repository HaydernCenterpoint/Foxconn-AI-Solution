import { useCallback, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { ViewerTopbar } from './ViewerTopbar';
import { TechBackground } from '../ui/TechBackground';
import { useMediaQuery } from '../ui/useMediaQuery';
import { useUiStore } from '../../store/ui.store';

export function ViewerLayout() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUiStore();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerOpen = !isDesktop && !sidebarCollapsed;

  useEffect(() => {
    if (!isDesktop) {
      setSidebarCollapsed(true);
    }
  }, [isDesktop, location.pathname, setSidebarCollapsed]);

  useEffect(() => {
    document.title = `${t('dashboard.viewerTitle', 'Báo cáo Sản lượng')} | ${t('common.appTitleSuffix')}`;
  }, [t]);

  const closeDrawer = useCallback(() => {
    setSidebarCollapsed(true);
    menuButtonRef.current?.focus();
  }, [setSidebarCollapsed]);

  const handleSidebarToggle = useCallback(() => {
    if (isDesktop) {
      toggleSidebar();
      return;
    }
    setSidebarCollapsed(false);
  }, [isDesktop, setSidebarCollapsed, toggleSidebar]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDrawer, drawerOpen]);

  return (
    <div className="app-shell">
      <TechBackground />
      <ViewerTopbar
        onToggleSidebar={handleSidebarToggle}
        isSidebarOpen={drawerOpen}
        menuButtonRef={menuButtonRef}
      />
      <div className="app-shell__content">
        {isDesktop ? (
          <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} alarmCount={0} />
        ) : drawerOpen ? (
          <>
            <button
              type="button"
              className="app-drawer-overlay"
              onClick={closeDrawer}
              aria-label={t('common.aria.close')}
            />
            <Sidebar variant="drawer" collapsed={false} alarmCount={0} onClose={closeDrawer} onNavigate={closeDrawer} />
          </>
        ) : null}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default ViewerLayout;
