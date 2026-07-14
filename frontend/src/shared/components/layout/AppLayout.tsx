import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TechBackground } from '../ui/TechBackground';
import { useMediaQuery } from '../ui/useMediaQuery';
import { useUiStore } from '../../store/ui.store';
import { dashboardApi } from '../../../features/dashboard/services/dashboard.api';
import { queryClient } from '../../../app/queryClient';
import { queryKeys } from '../../../app/queryKeys';
import { routeMetaByPath } from '../../../app/routeMeta';
import { invalidateRefreshScope } from '../../../app/refresh';
import { queryTimings } from '../../../app/queryOptions';

export function AppLayout() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUiStore();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const drawerOpen = !isDesktop && !sidebarCollapsed;

  useEffect(() => {
    if (!isDesktop) {
      setSidebarCollapsed(true);
    }
  }, [isDesktop, location.pathname, setSidebarCollapsed]);

  const routeMeta = useMemo(
    () => routeMetaByPath[location.pathname] ?? { titleKey: 'common.appName', refreshScope: 'all' as const },
    [location.pathname],
  );
  const title = t(routeMeta.titleKey);

  useEffect(() => {
    document.title = `${title} | ${t('common.appTitleSuffix')}`;
  }, [title, t]);

  const { data: summary, isError } = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
    refetchInterval: queryTimings.appShellSummary,
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await invalidateRefreshScope(queryClient, routeMeta.refreshScope);
    } finally {
      window.setTimeout(() => setIsRefreshing(false), 250);
    }
  };

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
      <Topbar
        isOnline={!isError}
        refreshScope={routeMeta.refreshScope}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onToggleSidebar={handleSidebarToggle}
        isSidebarOpen={drawerOpen}
        menuButtonRef={menuButtonRef}
      />
      <div className="app-shell__content">
        {isDesktop ? (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            alarmCount={summary?.activeAlarms ?? 0}
          />
        ) : drawerOpen ? (
          <>
            <button
              type="button"
              className="app-drawer-overlay"
              onClick={closeDrawer}
              aria-label={t('common.aria.close')}
            />
            <Sidebar
              variant="drawer"
              collapsed={false}
              alarmCount={summary?.activeAlarms ?? 0}
              onClose={closeDrawer}
              onNavigate={closeDrawer}
            />
          </>
        ) : null}
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
