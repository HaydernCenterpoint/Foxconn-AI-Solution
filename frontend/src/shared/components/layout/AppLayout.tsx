import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { TechBackground } from '../ui/TechBackground';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1279.98px)');
    const apply = () => {
      if (mql.matches) setSidebarCollapsed(true);
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [setSidebarCollapsed]);

  const routeMeta = useMemo(
    () => routeMetaByPath[location.pathname] ?? { titleKey: 'common.appName', refreshScope: 'all' as const },
    [location.pathname]
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

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#060a16]">
      <TechBackground />
      <Topbar
        isOnline={!isError}
        refreshScope={routeMeta.refreshScope}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onToggleSidebar={toggleSidebar}
      />
      <div className="flex flex-1 min-w-0 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          alarmCount={summary?.activeAlarms ?? 0}
        />
        <main className="flex-1 overflow-y-auto p-6 bg-transparent flex flex-col">
          <Outlet />
        </main>
      </div>
      
      {/* Ticker news marquee footer */}
      <footer className="h-8 shrink-0 flex items-center justify-between border-t border-[#14356a] bg-[#040812] px-4 text-xs z-30 select-none">
        <div className="flex items-center gap-2 font-black text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />

        </div>
        
        <div className="flex-1 flex items-center h-full overflow-hidden ml-6">
          <div className="flex items-center gap-1.5 px-4 h-full clip-slanted-footer-badge bg-[#e65100] text-white text-[10px] font-black shrink-0 uppercase tracking-widest mr-3 select-none pr-6">
            <span className="animate-pulse">(!)</span> TIN HỆ THỐNG
          </div>
          <div className="flex-1 overflow-hidden relative w-full h-full flex items-center">
            <div className="animate-marquee whitespace-nowrap flex gap-8 text-[10px] font-bold text-slate-300 uppercase items-center">
              <span><strong className="text-[#00f0ff]">09:40</strong> Dây chuyền LINE A đã đạt kế hoạch sản lượng ngày.</span>
              <span className="text-[#14356a] font-light">|</span>
              <span><strong className="text-[#00f0ff]">09:25</strong> Đã hoàn tất sao lưu dữ liệu hệ thống tự động.</span>
              <span className="text-[#14356a] font-light">|</span>
              <span><strong className="text-[#00f0ff]">09:10</strong> Cập nhật phần mềm thiết bị HÀN-02 thành công.</span>
              <span className="text-[#14356a] font-light">|</span>
              <span><strong className="text-[#00f0ff]">08:45</strong> PLC Client kết nối thành công, đồng bộ 20/20 thiết bị.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
