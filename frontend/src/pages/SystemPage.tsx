import { useQuery } from '@tanstack/react-query';
import { Activity, ClipboardList, Database, Radio, RefreshCw, Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../app/queryKeys';
import { queryTimings } from '../app/queryOptions';
import { Badge, type BadgeVariant } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { StatCard } from '../shared/components/ui/StatCard';
import { Surface } from '../shared/components/ui/Surface';
import { useAuthStore } from '../shared/store/auth.store';
import {
  systemApi,
  type ConnectorStatus,
  type HealthCheck,
  type TelemetrySnapshot,
} from '../features/system/services/system.api';

function toLocale(language: string) {
  if (language === 'zh' || language === 'zh-CN') return 'zh-CN';
  return language === 'en' ? 'en-US' : 'vi-VN';
}

function formatDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale);
}

function healthVariant(status: string): BadgeVariant {
  const normalized = status.toLowerCase();
  if (normalized === 'healthy') return 'success';
  if (normalized === 'degraded') return 'warning';
  if (normalized === 'unhealthy') return 'error';
  return 'neutral';
}

function connectorVariant(connector: ConnectorStatus): BadgeVariant {
  const status = connector.status.toLowerCase();
  if (connector.errors > 0 || status === 'error' || status === 'failed') return 'error';
  if (connector.running || status === 'success' || status === 'idle') return 'success';
  if (status === 'degraded' || status === 'stopped') return 'warning';
  return 'neutral';
}

function payloadText(payload: unknown) {
  try {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    if (!text) return '—';
    return text.length > 1_200 ? `${text.slice(0, 1_200)}…` : text;
  } catch {
    return String(payload ?? '—');
  }
}

function TelemetryTable({
  snapshots,
  locale,
  showPayload,
}: {
  snapshots: TelemetrySnapshot[];
  locale: string;
  showPayload?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-176">
        <thead>
          <tr>
            <th>{t('systemMonitor.columns.client')}</th>
            <th>{t('systemMonitor.columns.machine')}</th>
            <th>{t('systemMonitor.columns.ipAddress')}</th>
            <th>{t('systemMonitor.columns.receivedAt')}</th>
            {showPayload && <th>{t('systemMonitor.columns.payload')}</th>}
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot, index) => (
            <tr key={`${snapshot.clientId}-${snapshot.receivedAt}-${index}`}>
              <td className="font-mono text-xs text-text-primary">{snapshot.clientId}</td>
              <td>{snapshot.machineName ?? '—'}</td>
              <td className="font-mono text-xs text-text-secondary">{snapshot.ipAddress ?? '—'}</td>
              <td className="whitespace-nowrap text-text-secondary">{formatDate(snapshot.receivedAt, locale)}</td>
              {showPayload && (
                <td className="max-w-112">
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap wrap-break-word rounded bg-surface-container-low p-2 font-mono text-xs text-text-secondary">
                    {payloadText(snapshot.payload)}
                  </pre>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HealthChecks({ checks }: { checks: HealthCheck[] }) {
  const { t } = useTranslation();

  if (checks.length === 0) {
    return <DataState kind="empty" title={t('systemMonitor.noChecks')} description={t('systemMonitor.noChecksDescription')} />;
  }

  return (
    <ul className="divide-y divide-border">
      {checks.map((check) => (
        <li key={check.name} className="flex items-center justify-between gap-4 py-3">
          <span className="min-w-0 truncate text-sm font-medium text-text-primary">{check.name}</span>
          <Badge variant={healthVariant(check.status)} size="sm" dot>{check.status}</Badge>
        </li>
      ))}
    </ul>
  );
}

function ConnectorTable({
  connectors,
  locale,
}: {
  connectors: ConnectorStatus[];
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto">
      <table className="data-table min-w-176">
        <thead>
          <tr>
            <th>{t('systemMonitor.connectorColumns.name')}</th>
            <th>{t('systemMonitor.connectorColumns.status')}</th>
            <th>{t('systemMonitor.connectorColumns.lastSuccessfulSync')}</th>
            <th>{t('systemMonitor.connectorColumns.records')}</th>
            <th>{t('systemMonitor.connectorColumns.errors')}</th>
            <th>{t('systemMonitor.connectorColumns.error')}</th>
          </tr>
        </thead>
        <tbody>
          {connectors.map((connector) => (
            <tr key={connector.name}>
              <td className="font-mono text-xs text-text-primary">{connector.name}</td>
              <td>
                <Badge
                  variant={connectorVariant(connector)}
                  size="sm"
                  dot
                >
                  {connector.status}
                </Badge>
              </td>
              <td className="whitespace-nowrap text-text-secondary">
                {connector.lastSuccessfulSync ? formatDate(connector.lastSuccessfulSync, locale) : '—'}
              </td>
              <td>{connector.recordsSynced.toLocaleString(locale)}</td>
              <td>{connector.errors.toLocaleString(locale)}</td>
              <td className="max-w-80 text-text-secondary">{connector.errorMessage ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SystemPage() {
  const { t, i18n } = useTranslation();
  const locale = toLocale(i18n.language);
  const role = useAuthStore((state) => state.role);
  const canViewConnectors = role === 'ADMIN' || role === 'ENGINEER';
  const healthQuery = useQuery({
    queryKey: queryKeys.system.health(),
    queryFn: systemApi.getHealth,
    refetchInterval: queryTimings.system,
    retry: 1,
  });
  const liveQuery = useQuery({
    queryKey: queryKeys.system.liveTelemetry(),
    queryFn: systemApi.getLiveTelemetry,
    refetchInterval: queryTimings.system,
    retry: 1,
  });
  const logQuery = useQuery({
    queryKey: queryKeys.system.telemetryLog(20),
    queryFn: () => systemApi.getTelemetryLog(20),
    refetchInterval: queryTimings.system,
    retry: 1,
  });
  const connectorsQuery = useQuery({
    queryKey: queryKeys.system.connectors(),
    queryFn: systemApi.getConnectors,
    refetchInterval: queryTimings.system,
    retry: 1,
    enabled: canViewConnectors,
  });

  const isRefreshing = healthQuery.isFetching || liveQuery.isFetching || logQuery.isFetching || connectorsQuery.isFetching;
  const refresh = async () => {
    await Promise.all([
      healthQuery.refetch(),
      liveQuery.refetch(),
      logQuery.refetch(),
      ...(canViewConnectors ? [connectorsQuery.refetch()] : []),
    ]);
  };
  const health = healthQuery.data;
  const liveSnapshots = liveQuery.data ?? [];
  const logSnapshots = logQuery.data ?? [];
  const connectors = connectorsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('systemMonitor.eyebrow')}
        title={t('systemMonitor.title')}
        description={t('systemMonitor.description')}
        actions={(
          <Button
            variant="secondary"
            size="sm"
            loading={isRefreshing}
            startIcon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => { void refresh(); }}
          >
            {t('common.actions.refresh')}
          </Button>
        )}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('systemMonitor.backendHealth')}
          value={healthQuery.isLoading ? '—' : health?.status ?? t('common.status.backendOffline')}
          icon={<Server size={20} aria-hidden="true" />}
          accent={healthVariant(health?.status ?? 'unhealthy') === 'success' ? 'success' : healthVariant(health?.status ?? 'unhealthy') === 'warning' ? 'warning' : 'error'}
          hint={healthQuery.isError ? t('systemMonitor.healthUnavailable') : t('systemMonitor.healthHint')}
          loading={healthQuery.isLoading}
        />
        <StatCard
          label={t('systemMonitor.healthChecks')}
          value={healthQuery.isLoading ? '—' : String(health?.checks.length ?? 0)}
          icon={<Database size={20} aria-hidden="true" />}
          accent="info"
          hint={t('systemMonitor.healthChecksHint')}
          loading={healthQuery.isLoading}
        />
        <StatCard
          label={t('systemMonitor.liveClients')}
          value={liveQuery.isLoading ? '—' : String(liveSnapshots.length)}
          icon={<Radio size={20} aria-hidden="true" />}
          accent={liveQuery.isError ? 'error' : 'running'}
          hint={liveQuery.isError ? t('systemMonitor.telemetryUnavailable') : t('systemMonitor.liveClientsHint')}
          loading={liveQuery.isLoading}
        />
        <StatCard
          label={t('systemMonitor.logEntries')}
          value={logQuery.isLoading ? '—' : String(logSnapshots.length)}
          icon={<ClipboardList size={20} aria-hidden="true" />}
          accent={logQuery.isError ? 'error' : 'neutral'}
          hint={t('systemMonitor.logEntriesHint')}
          loading={logQuery.isLoading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('systemMonitor.liveTelemetry')}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('systemMonitor.liveTelemetryDescription')}</p>
            </div>
            {!liveQuery.isLoading && !liveQuery.isError && <Badge variant="info" size="sm">{t('systemMonitor.count', { count: liveSnapshots.length })}</Badge>}
          </div>
          {liveQuery.isLoading ? (
            <DataState kind="loading" title={t('systemMonitor.loadingTelemetry')} />
          ) : liveQuery.isError ? (
            <DataState
              kind="error"
              title={t('systemMonitor.telemetryUnavailable')}
              description={t('systemMonitor.telemetryUnavailableDescription')}
              action={<Button variant="secondary" size="sm" onClick={() => { void liveQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
            />
          ) : liveSnapshots.length === 0 ? (
            <DataState kind="empty" title={t('systemMonitor.noLiveTelemetry')} description={t('systemMonitor.noLiveTelemetryDescription')} />
          ) : (
            <TelemetryTable snapshots={liveSnapshots} locale={locale} />
          )}
        </Surface>

        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('systemMonitor.healthChecks')}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('systemMonitor.healthChecksDescription')}</p>
            </div>
            {health && <Badge variant={healthVariant(health.status)} size="sm" dot>{health.status}</Badge>}
          </div>
          {healthQuery.isLoading ? (
            <DataState kind="loading" title={t('systemMonitor.loadingHealth')} />
          ) : healthQuery.isError ? (
            <DataState
              kind="error"
              title={t('systemMonitor.healthUnavailable')}
              description={t('systemMonitor.healthUnavailableDescription')}
              action={<Button variant="secondary" size="sm" onClick={() => { void healthQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
            />
          ) : (
            <div className="px-5 py-1"><HealthChecks checks={health?.checks ?? []} /></div>
          )}
        </Surface>
      </div>

      {canViewConnectors && (
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('systemMonitor.connectors')}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('systemMonitor.connectorsDescription')}</p>
            </div>
            {!connectorsQuery.isLoading && !connectorsQuery.isError && (
              <Badge variant="info" size="sm">
                {t('systemMonitor.connectorCount', { count: connectors.length })}
              </Badge>
            )}
          </div>
          {connectorsQuery.isLoading ? (
            <DataState kind="loading" title={t('systemMonitor.loadingConnectors')} />
          ) : connectorsQuery.isError ? (
            <DataState
              kind="error"
              title={t('systemMonitor.connectorsUnavailable')}
              description={t('systemMonitor.connectorsUnavailableDescription')}
              action={<Button variant="secondary" size="sm" onClick={() => { void connectorsQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
            />
          ) : connectors.length === 0 ? (
            <DataState kind="empty" title={t('systemMonitor.noConnectors')} description={t('systemMonitor.noConnectorsDescription')} />
          ) : (
            <ConnectorTable connectors={connectors} locale={locale} />
          )}
        </Surface>
      )}

      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="panel-header">
          <div>
            <h2 className="title-small text-text-primary">{t('systemMonitor.rawLog')}</h2>
            <p className="mt-1 text-xs text-text-muted">{t('systemMonitor.rawLogDescription')}</p>
          </div>
          {!logQuery.isLoading && !logQuery.isError && <Activity size={18} className="text-text-muted" aria-hidden="true" />}
        </div>
        {logQuery.isLoading ? (
          <DataState kind="loading" title={t('systemMonitor.loadingLog')} />
        ) : logQuery.isError ? (
          <DataState
            kind="error"
            title={t('systemMonitor.logUnavailable')}
            description={t('systemMonitor.logUnavailableDescription')}
            action={<Button variant="secondary" size="sm" onClick={() => { void logQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
          />
        ) : logSnapshots.length === 0 ? (
          <DataState kind="empty" title={t('systemMonitor.noLogEntries')} description={t('systemMonitor.noLogEntriesDescription')} />
        ) : (
          <TelemetryTable snapshots={logSnapshots} locale={locale} showPayload />
        )}
      </Surface>
    </div>
  );
}
