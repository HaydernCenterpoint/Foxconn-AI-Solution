import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Globe,
  MonitorCog,
  Palette,
  RefreshCw,
  UserRound,
  Wifi,
  WifiOff,
  Users,
  FileText,
  Info,
} from 'lucide-react';
import { auditLogsApi } from '../../features/admin/services/auditLogs.api';
import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import { usersApi } from '../../features/admin/services/users.api';
import { queryClient } from '../../app/queryClient';
import { queryKeys } from '../../app/queryKeys';
import { LanguageSelector } from '../../shared/components/i18n/LanguageSelector';
import { Badge } from '../../shared/components/ui/Badge';
import { EmptyState, LoadingState } from '../../shared/components/ui/EmptyState';
import { Dropdown } from '../../shared/components/ui/Dropdown';
import { StatCard } from '../../shared/components/ui/StatCard';
import { fmt, fmtDate } from '../../shared/lib/utils';
import { useAuthStore } from '../../shared/store/auth.store';
import { useUiStore } from '../../shared/store/ui.store';

interface SettingSectionProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}

function SettingSection({ icon, title, children }: SettingSectionProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline-variant)' }}
    >
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
          {icon}
        </div>
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-on-surface)' }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const ui = useUiStore();
  const frontendVersion = t('common.versionLabel', 'v2.0.0');

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: usersApi.getAll,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.admin.auditLogs(50),
    queryFn: () => auditLogsApi.getAll(50),
  });

  const deleteUserMutation = useMutation({
    mutationFn: usersApi.delete,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() });
      ui.addToast('success', t('settings.users.deleteSuccess', 'Đã xóa người dùng thành công'));
    },
    onError: () => ui.addToast('error', t('settings.users.deleteError', 'Lỗi khi xóa người dùng')),
  });

  return (
    <div className="space-y-5">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label={t('settings.stats.backend', 'Trạng thái Backend')}
          value={summaryQuery.isError ? t('common.values.offline', 'OFFLINE') : t('common.values.online', 'ONLINE')}
          icon={summaryQuery.isError ? <WifiOff size={18} /> : <Wifi size={18} />}
          accent={summaryQuery.isError ? 'error' : 'running'}
        />
        <StatCard
          label={t('settings.stats.frontend', 'Phiên bản Client')}
          value={frontendVersion}
          icon={<MonitorCog size={18} />}
          accent="info"
        />
        <StatCard
          label={t('settings.stats.activeUser', 'Người dùng')}
          value={auth.username || 'N/A'}
          icon={<UserRound size={18} />}
          accent="primary"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* User Profile */}
        <SettingSection icon={<UserRound size={18} />} title={t('settings.profile.title', 'Thông tin tài khoản')}>
          <div className="space-y-3.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">{t('settings.profile.username', 'Tên đăng nhập')}</span>
              <span className="font-semibold text-text-primary">{auth.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">{t('settings.profile.role', 'Quyền hạn')}</span>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                {auth.role}
              </span>
            </div>
          </div>
        </SettingSection>

        {/* Display / Language */}
        <SettingSection icon={<Globe size={18} />} title={t('settings.language.title', 'Ngôn ngữ & Hiển thị')}>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('settings.language.selectLabel', 'Chọn ngôn ngữ hệ thống')}
              </label>
              <LanguageSelector />
            </div>
          </div>
        </SettingSection>

        {/* Theme Settings */}
        <SettingSection icon={<Palette size={18} />} title={t('settings.theme.title', 'Tùy chỉnh giao diện')}>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
              {t('settings.theme.selectLabel', 'Tông màu chủ đạo')}
            </label>
            <div className="flex flex-wrap gap-2.5">
              {[
                { value: 'theme-teal', label: 'Cyan / Teal', color: '#20DFF3' },
                { value: 'theme-blue', label: 'Blue', color: '#2563EB' },
                { value: 'theme-green', label: 'Green', color: '#10B981' },
              ].map((theme) => (
                <button
                  key={theme.value}
                  onClick={() => ui.setTheme(theme.value as any)}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer ${
                    ui.theme === theme.value
                      ? 'border-[#20DFF3] bg-[#20DFF3]/5 text-[#20DFF3]'
                      : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.color }} />
                  {theme.label}
                </button>
              ))}
            </div>
          </div>
        </SettingSection>
      </div>

      {/* User Management Section */}
      <SettingSection icon={<Users size={18} />} title={t('settings.users.title', 'Quản lý tài khoản (Admin Only)')}>
        {usersQuery.isLoading ? (
          <LoadingState />
        ) : usersQuery.isError ? (
          <EmptyState icon={<Info size={24} />} title={t('settings.users.loadError')} />
        ) : (
          <div className="space-y-3">
            {usersQuery.data?.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-2">
                <div>
                  <span className="font-semibold text-text-primary text-sm">{user.username}</span>
                  <span className="ml-2 text-xs text-text-muted">({user.role})</span>
                </div>
                {user.username !== auth.username && (
                  <button
                    onClick={() => {
                      if (window.confirm(t('settings.users.deleteConfirm', 'Xóa tài khoản này?'))) {
                        deleteUserMutation.mutate(user.id);
                      }
                    }}
                    className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-bold hover:bg-rose-500/20 transition-all active:scale-95 cursor-pointer"
                  >
                    XÓA
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </SettingSection>
    </div>
  );
}
export { SettingsPage };
