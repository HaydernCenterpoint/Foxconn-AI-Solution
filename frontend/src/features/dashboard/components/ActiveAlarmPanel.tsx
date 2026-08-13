
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import type { Alarm } from '../../alarms/services/alarms.api';
import type { RecentAlarm } from '../services/dashboard.api';
import { Badge, type BadgeVariant } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { formatDateTime } from '../../../shared/lib/utils';
import { DashboardPanel } from './DashboardPanel';

interface ActiveAlarmPanelProps {
  alarms?: Array<Alarm | RecentAlarm>;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  className?: string;
}

function severityVariant(severity: string): BadgeVariant {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return 'error';
    case 'MEDIUM':
      return 'warning';
    case 'LOW':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function ActiveAlarmPanel({
  alarms = [],
  isLoading,
  isError,
  onRetry,
  className = '',
}: ActiveAlarmPanelProps) {
  const { t } = useTranslation();

  return (
    <DashboardPanel
      title={t('dashboardPage.recentAlarmsTitle', { defaultValue: 'Recent alarm activity' })}
      description={t('dashboardPage.recentAlarmsDescription', { defaultValue: 'Current alarm records returned by the alarm and dashboard services.' })}
      icon={<MaterialSymbol name="notifications_active" size={18} />}
      className={`dashboard-analytics-grid__alarms ${className}`.trim()}
      actions={alarms.length > 0 ? <Badge variant="error">{alarms.length}</Badge> : undefined}
    >
      {isLoading ? (
        <DataState kind="loading" title={t('dashboardPage.loadingAlarms', { defaultValue: 'Loading alarms' })} />
      ) : isError ? (
        <DataState
          kind="error"
          title={t('dashboardPage.alarmsError', { defaultValue: 'Alarm records are unavailable' })}
          description={t('dashboardPage.alarmsErrorDescription', { defaultValue: 'The alarm service did not return current records.' })}
          action={onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      ) : alarms.length === 0 ? (
        <DataState
          kind="empty"
          title={t('dashboardPage.noAlarms', { defaultValue: 'No recent alarms' })}
          description={t('dashboardPage.noAlarmsDescription', { defaultValue: 'No alarm records were returned for this dashboard refresh.' })}
        />
      ) : (
        <div className="dashboard-alarm-list">
          {alarms.map((alarm, index) => (
            <article className="dashboard-alarm-item" key={`${alarm.id}-${alarm.createdAt}-${index}`}>
              <div className="dashboard-alarm-item__topline">
                <span className="dashboard-alarm-item__name">{alarm.machineName || alarm.machineId}</span>
                <Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge>
              </div>
              <p className="dashboard-alarm-item__message">{alarm.message}</p>
              <time className="dashboard-alarm-item__time" dateTime={alarm.createdAt || undefined}>
                {formatDateTime(alarm.createdAt)}
              </time>
            </article>
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}
