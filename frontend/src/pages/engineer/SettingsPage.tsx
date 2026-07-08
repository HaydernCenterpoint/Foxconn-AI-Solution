import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Globe,
  MonitorCog,
  Palette,
  UserRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import { queryKeys } from '../../app/queryKeys';
import { LanguageSelector } from '../../shared/components/i18n/LanguageSelector';
import { StatCard } from '../../shared/components/ui/StatCard';
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
    </div>
  );
}
export { SettingsPage };
