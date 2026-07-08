import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { ViewerTopbar } from './ViewerTopbar';
import { TechBackground } from '../ui/TechBackground';
import { useUiStore } from '../../store/ui.store';

export function ViewerLayout() {
  const { t } = useTranslation();
  const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUiStore();

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279.98px)');
    const apply = () => {
      if (mql.matches) setSidebarCollapsed(true);
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [setSidebarCollapsed]);

  useEffect(() => {
    document.title = `${t('dashboard.viewerTitle', 'Báo cáo Sản lượng')} | ${t('common.appTitleSuffix', 'MKZ Factory Monitor')}`;
  }, [t]);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
      <TechBackground />
      <ViewerTopbar />
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          alarmCount={0}
        />
        <main className="flex-1 overflow-y-auto p-6 bg-transparent flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
export default ViewerLayout;
