import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, Globe2, MonitorCog, Palette, RefreshCw, ShieldCheck, UserRound, UsersRound, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { queryClient } from '../../app/queryClient';
import { queryKeys } from '../../app/queryKeys';
import { AppearancePreferences, SettingsSection } from '../../features/admin/components/SettingsSection';
import { UserRoleBadge } from '../../features/admin/components/UserRoleBadge';
import { getApiErrorMessage } from '../../features/admin/lib/apiError';
import { auditLogsApi } from '../../features/admin/services/auditLogs.api';
import { usersApi, type User } from '../../features/admin/services/users.api';
import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import { LanguageControl } from '../../shared/components/ui/LanguageControl';
import { Badge } from '../../shared/components/ui/Badge';
import { Button } from '../../shared/components/ui/Button';
import { ConfirmDialog } from '../../shared/components/ui/ConfirmDialog';
import { DataState } from '../../shared/components/ui/DataState';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { StatCard } from '../../shared/components/ui/StatCard';
import { useAuthStore } from '../../shared/store/auth.store';
import { useUiStore } from '../../shared/store/ui.store';
import { formatDateTime } from '../../shared/lib/utils';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const username = useAuthStore((state) => state.username);
  const role = useAuthStore((state) => state.role);
  const addToast = useUiStore((state) => state.addToast);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
  });

  const usersQuery = useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: usersApi.getAll,
  });

  const auditQuery = useQuery({
    queryKey: queryKeys.admin.auditLogs(100),
    queryFn: () => auditLogsApi.getAll(100),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() }),
        queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      ]);
      addToast('success', t('settings.users.deleteSuccess'));
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (error) => {
      setDeleteError(getApiErrorMessage(error, t('settings.users.deleteError')));
    },
  });

  const isCurrentUser = (user: User) =>
    Boolean(username && user.username.toLowerCase() === username.toLowerCase());
  const backendValue = summaryQuery.isLoading
    ? t('common.loading')
    : summaryQuery.isError
      ? t('common.notAvailable')
      : t('common.values.online');
  const roleLabel = role ? t(`common.role.${role}`) : t('common.notAvailable');
  const auditLogs = auditQuery.data ?? [];
  const deleteDescription = deleteTarget
    ? `${t('pages.users.deleteDescription', { username: deleteTarget.username })}${deleteError ? ` ${deleteError}` : ''}`
    : '';

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
          icon={summaryQuery.isError ? <WifiOff size={18} /> : <Wifi size={18} />}
          accent={summaryQuery.isError ? 'error' : 'running'}
          loading={summaryQuery.isLoading}
        />
        <StatCard
          label={t('settings.stats.activeUser')}
          value={username || t('common.notAvailable')}
          icon={<UserRound size={18} />}
          accent="primary"
        />
        <StatCard
          label={t('settings.stats.role')}
          value={roleLabel}
          icon={<ShieldCheck size={18} />}
          accent="info"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection
          icon={<UserRound size={20} />}
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
          icon={<Globe2 size={20} />}
          title={t('settings.language.title')}
          description={t('settings.language.hint')}
        >
          <LanguageControl />
        </SettingsSection>

        <SettingsSection
          icon={<Palette size={20} />}
          title={t('settings.sections.appearance')}
          description={t('settings.appearance.themeHint')}
        >
          <AppearancePreferences />
        </SettingsSection>

        <SettingsSection
          icon={<MonitorCog size={20} />}
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

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsSection
          icon={<UsersRound size={20} />}
          title={t('settings.sections.users')}
          description={t('pages.users.subtitle')}
        >
          {usersQuery.isLoading ? (
            <DataState kind="loading" title={t('pages.users.loading')} />
          ) : usersQuery.isError ? (
            <DataState
              kind="error"
              title={t('pages.users.loadErrorTitle')}
              description={t('pages.users.loadError')}
              action={(
                <Button
                  variant="secondary"
                  size="sm"
                  startIcon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={() => {
                    void usersQuery.refetch();
                  }}
                >
                  {t('common.actions.retry')}
                </Button>
              )}
            />
          ) : (usersQuery.data?.length ?? 0) === 0 ? (
            <DataState kind="empty" icon={<UsersRound aria-hidden="true" />} title={t('pages.users.empty')} />
          ) : (
            <div className="space-y-4">
              <ul className="divide-y divide-border rounded-md border border-border bg-surface-container-low">
                {usersQuery.data?.map((user) => {
                  const isSelf = isCurrentUser(user);

                  return (
                    <li key={user.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text-primary">{user.username}</span>
                          {isSelf && <Badge variant="primary" size="sm">{t('pages.users.self')}</Badge>}
                        </div>
                        <div className="mt-2"><UserRoleBadge role={user.role} /></div>
                      </div>
                      {isSelf ? (
                        <span className="text-xs text-text-muted">{t('pages.users.cannotDeleteSelf')}</span>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setDeleteError('');
                            setDeleteTarget(user);
                          }}
                        >
                          {t('common.actions.delete')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>
                {t('titles.users')}
              </Button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          icon={<ClipboardList size={20} />}
          title={t('settings.sections.audit')}
          description={t('pages.auditLogs.subtitle')}
        >
          {auditQuery.isLoading ? (
            <DataState kind="loading" title={t('pages.auditLogs.loading')} />
          ) : auditQuery.isError ? (
            <DataState
              kind="error"
              title={t('pages.auditLogs.loadErrorTitle')}
              description={t('pages.auditLogs.loadError')}
              action={(
                <Button
                  variant="secondary"
                  size="sm"
                  startIcon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={() => {
                    void auditQuery.refetch();
                  }}
                >
                  {t('common.actions.retry')}
                </Button>
              )}
            />
          ) : auditLogs.length === 0 ? (
            <DataState kind="empty" icon={<ClipboardList aria-hidden="true" />} title={t('pages.auditLogs.empty')} />
          ) : (
            <div className="space-y-4">
              <ul className="divide-y divide-border rounded-md border border-border bg-surface-container-low">
                {auditLogs.slice(0, 3).map((log) => (
                  <li key={log.id} className="p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="neutral" size="sm">{log.action}</Badge>
                      <time dateTime={log.createdAt} className="text-xs text-text-muted">
                        {formatDateTime(log.createdAt)}
                      </time>
                    </div>
                    <p className="mt-2 text-sm text-text-primary">{log.username}</p>
                  </li>
                ))}
              </ul>
              <Button variant="secondary" size="sm" onClick={() => navigate('/admin/audit-logs')}>
                {t('navigation.auditLogs')}
              </Button>
            </div>
          )}
        </SettingsSection>
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('pages.users.deleteTitle')}
        description={deleteDescription}
        confirmLabel={t('common.actions.delete')}
        cancelLabel={t('common.actions.cancel')}
        confirmTone="danger"
        isPending={deleteUserMutation.isPending}
        onCancel={() => {
          if (!deleteUserMutation.isPending) {
            setDeleteTarget(null);
            setDeleteError('');
          }
        }}
        onConfirm={() => {
          if (deleteTarget) deleteUserMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

export default SettingsPage;
