import { useQuery } from '@tanstack/react-query';
import { MaterialSymbol } from '../../shared/components/ui/MaterialSymbol';

import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../app/queryKeys';
import { AppearancePreferences, SettingsSection } from '../../features/admin/components/SettingsSection';
import { UserRoleBadge } from '../../features/admin/components/UserRoleBadge';
import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import { LanguageControl } from '../../shared/components/ui/LanguageControl';
import { Badge } from '../../shared/components/ui/Badge';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { StatCard } from '../../shared/components/ui/StatCard';
import { useAuthStore } from '../../shared/store/auth.store';

export function SettingsPage() {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.username);
  const role = useAuthStore((state) => state.role);

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
  });

  const backendValue = summaryQuery.isLoading
    ? t('common.loading')
    : summaryQuery.isError
      ? t('common.notAvailable')
      : t('common.values.online');
  const roleLabel = role ? t(`common.role.${role}`) : t('common.notAvailable');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('navigation.settings')}
        title={t('settings.title')}
        description={t('settings.viewerSubtitle')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label={t('settings.stats.backend')}
          value={backendValue}
          icon={summaryQuery.isError ? <MaterialSymbol name="wifi_off" size={18} /> : <MaterialSymbol name="wifi" size={18} />}
          accent={summaryQuery.isError ? 'error' : 'running'}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          label={t('settings.stats.activeUser')}
          value={username || t('common.notAvailable')}
          icon={<MaterialSymbol name="person" size={18} />}
          accent="primary"
        />
        <StatCard
          label={t('settings.stats.role')}
          value={roleLabel}
          icon={<MaterialSymbol name="verified_user" size={18} />}
          accent="info"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection
          icon={<MaterialSymbol name="person" size={20} />}
          title={t('settings.profile.title')}
          description={t('settings.sections.account')}
        >
          <dl className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dt className="text-sm text-text-secondary">{t('settings.profile.username')}</dt>
              <dd className="text-sm font-semibold text-text-primary">{username || t('common.notAvailable')}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dt className="text-sm text-text-secondary">{t('settings.profile.role')}</dt>
              <dd><UserRoleBadge role={role} /></dd>
            </div>
          </dl>
          <p className="mt-5 rounded-md border border-border bg-surface-container-low p-3 text-sm text-text-secondary">
            {t('settings.account.passwordHint')}
          </p>
        </SettingsSection>

        <SettingsSection
          icon={<MaterialSymbol name="language" size={20} />}
          title={t('settings.language.title')}
          description={t('settings.language.hint')}
        >
          <LanguageControl />
        </SettingsSection>

        <SettingsSection
          icon={<MaterialSymbol name="palette" size={20} />}
          title={t('settings.sections.appearance')}
          description={t('settings.appearance.themeHint')}
        >
          <AppearancePreferences />
        </SettingsSection>

        <SettingsSection
          icon={<MaterialSymbol name="display_settings" size={20} />}
          title={t('settings.sections.system')}
          description={t('settings.system.frontendVersion')}
        >
          <dl className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dt className="text-sm text-text-secondary">{t('settings.system.frontendVersion')}</dt>
              <dd className="text-sm font-semibold text-text-primary">{t('common.versionLabel')}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <dt className="text-sm text-text-secondary">{t('settings.system.backendStatus')}</dt>
              <dd>
                <Badge variant={summaryQuery.isError ? 'error' : summaryQuery.isLoading ? 'neutral' : 'success'}>
                  {backendValue}
                </Badge>
              </dd>
            </div>
          </dl>
        </SettingsSection>
      </div>
    </div>
  );
}

export default SettingsPage;
