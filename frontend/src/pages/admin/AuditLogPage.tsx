import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarClock, ClipboardList, RefreshCw, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../app/queryKeys';
import { auditLogsApi } from '../../features/admin/services/auditLogs.api';
import { useDynamicTranslation } from '../../shared/lib/translator';
import { formatDateTime } from '../../shared/lib/utils';
import { useUiStore } from '../../shared/store/ui.store';
import { Badge, type BadgeVariant } from '../../shared/components/ui/Badge';
import { Button } from '../../shared/components/ui/Button';
import { DataState } from '../../shared/components/ui/DataState';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { Surface } from '../../shared/components/ui/Surface';

function getActionVariant(action: string): BadgeVariant {
  const normalizedAction = action.toUpperCase();

  if (normalizedAction.includes('DELETE') || normalizedAction.includes('REVOKE') || normalizedAction.includes('FAILED')) {
    return 'error';
  }
  if (normalizedAction.includes('CREATE') || normalizedAction.includes('LOGIN') || normalizedAction.includes('SUCCESS')) {
    return 'success';
  }
  if (normalizedAction.includes('UPDATE') || normalizedAction.includes('EDIT') || normalizedAction.includes('REORDER')) {
    return 'info';
  }

  return 'neutral';
}

export default function AuditLogPage() {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const refreshIntervalSeconds = useUiStore((state) => state.refreshIntervalSeconds);
  const {
    data: logs = [],
    isError,
    isFetching,
    isLoading,
    isSuccess,
    refetch,
  } = useQuery({
    queryKey: queryKeys.admin.auditLogs(100),
    queryFn: () => auditLogsApi.getAll(100),
    refetchInterval: refreshIntervalSeconds > 0 ? refreshIntervalSeconds * 1000 : false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('settings.sections.audit')}
        title={t('pages.auditLogs.title')}
        description={t('pages.auditLogs.subtitle')}
        className="max-sm:flex-col max-sm:items-start"
        actions={(
          <>
            {isSuccess && (
              <Badge variant="neutral" size="md">
                {t('pages.auditLogs.recordsCount', { count: logs.length })}
              </Badge>
            )}
            <Button
              variant="secondary"
              size="sm"
              loading={isFetching && !isLoading}
              startIcon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => {
                void refetch();
              }}
            >
              {t('common.actions.refresh')}
            </Button>
          </>
        )}
      />

      {isLoading ? (
        <DataState kind="loading" title={t('pages.auditLogs.loading')} />
      ) : isError ? (
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
                void refetch();
              }}
            >
              {t('common.actions.retry')}
            </Button>
          )}
        />
      ) : logs.length === 0 ? (
        <DataState
          kind="empty"
          icon={<ClipboardList aria-hidden="true" />}
          title={t('pages.auditLogs.empty')}
        />
      ) : (
        <Surface variant="default" padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">{t('pages.auditLogs.title')}</caption>
              <thead>
                <tr>
                  <th scope="col" className="w-20">#</th>
                  <th scope="col">{t('pages.auditLogs.columns.time')}</th>
                  <th scope="col">{t('pages.auditLogs.columns.user')}</th>
                  <th scope="col">{t('pages.auditLogs.columns.action')}</th>
                  <th scope="col">{t('pages.auditLogs.columns.details')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="font-mono text-text-muted">{log.id}</td>
                    <td>
                      <time dateTime={log.createdAt} className="inline-flex items-center gap-2 whitespace-nowrap text-text-secondary">
                        <CalendarClock size={16} aria-hidden="true" />
                        {formatDateTime(log.createdAt)}
                      </time>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                        <UserRound size={16} className="text-text-muted" aria-hidden="true" />
                        {log.username}
                      </span>
                    </td>
                    <td>
                      <Badge variant={getActionVariant(log.action)} size="sm">
                        <Activity size={14} aria-hidden="true" />
                        {log.action}
                      </Badge>
                    </td>
                    <td className="max-w-lg break-words text-text-secondary">
                      {log.details ? tDynamic(log.details) : t('common.values.dash')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </div>
  );
}

export { AuditLogPage };
