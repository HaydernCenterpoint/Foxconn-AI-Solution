import { Activity, AlertTriangle, Factory, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DashboardSummary } from '../services/dashboard.api';
import type { Machine } from '../../machines/services/machines.api';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { StatCard } from '../../../shared/components/ui/StatCard';
import { Surface } from '../../../shared/components/ui/Surface';
import { formatNumber } from '../../../shared/lib/utils';
import { averageMachineMetric, isApprovedMachine } from './dashboardData';

interface DashboardKpiGridProps {
  summary?: DashboardSummary;
  machines?: Machine[];
  isLoading: boolean;
  isError: boolean;
  isMachinesLoading?: boolean;
  isMachinesError?: boolean;
  onRetry?: () => void;
}

export function DashboardKpiGrid({
  summary,
  machines = [],
  isLoading,
  isError,
  isMachinesLoading = false,
  isMachinesError = false,
  onRetry,
}: DashboardKpiGridProps) {
  const { t } = useTranslation();

  const labels = {
    production: t('dashboardPage.kpiOutputTitle', { defaultValue: 'Reported production' }),
    oee: t('dashboardPage.kpiOeeTitle', { defaultValue: 'Average OEE' }),
    alarms: t('dashboard.kpi.activeAlarms', { defaultValue: 'Active alarms' }),
    connectivity: t('dashboardPage.plcOnline', { defaultValue: 'PLC clients online' }),
  };

  if (isLoading) {
    return (
      <div className="dashboard-kpi-grid" aria-busy="true">
        <StatCard label={labels.production} value="" icon={<Factory size={20} />} loading />
        <StatCard label={labels.oee} value="" icon={<Activity size={20} />} loading />
        <StatCard label={labels.alarms} value="" icon={<AlertTriangle size={20} />} loading />
        <StatCard label={labels.connectivity} value="" icon={<Wifi size={20} />} loading />
      </div>
    );
  }

  if (!summary) {
    const kind = isError ? 'error' : 'empty';
    return (
      <Surface variant="raised" className="dashboard-state-surface">
        <DataState
          kind={kind}
          title={isError
            ? t('dashboardPage.summaryErrorTitle', { defaultValue: 'Dashboard summary is unavailable' })
            : t('dashboardPage.summaryEmptyTitle', { defaultValue: 'No dashboard summary is available' })}
          description={isError
            ? t('dashboardPage.summaryErrorDescription', { defaultValue: 'The latest dashboard data could not be loaded.' })
            : t('dashboardPage.summaryEmptyDescription', { defaultValue: 'The dashboard service did not return a summary.' })}
          action={isError && onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      </Surface>
    );
  }

  const approvedMachines = machines.filter(isApprovedMachine);
  const averageOee = averageMachineMetric(approvedMachines, 'oee');

  return (
    <div className="dashboard-kpi-grid">
      <StatCard
        label={labels.production}
        value={formatNumber(summary.totalProduction)}
        hint={t('dashboardPage.summarySource', { defaultValue: 'Dashboard summary' })}
        icon={<Factory size={20} aria-hidden="true" />}
        accent="primary"
      />
      <StatCard
        label={labels.oee}
        value={isMachinesLoading ? '' : averageOee === undefined ? '—' : `${averageOee.toFixed(1)}%`}
        hint={isMachinesError
          ? t('dashboardPage.machineDataUnavailable', { defaultValue: 'Machine data is unavailable' })
          : averageOee === undefined
            ? t('dashboardPage.noLiveOee', { defaultValue: 'No live OEE value reported' })
            : t('dashboardPage.reportingMachines', {
              defaultValue: '{{count}} reporting machines',
              count: approvedMachines.filter((machine) => averageMachineMetric([machine], 'oee') !== undefined).length,
            })}
        icon={<Activity size={20} aria-hidden="true" />}
        accent="running"
        loading={isMachinesLoading}
      />
      <StatCard
        label={labels.alarms}
        value={formatNumber(summary.activeAlarms)}
        hint={t('dashboardPage.recentAlarmActivity', { defaultValue: 'From the dashboard service' })}
        icon={<AlertTriangle size={20} aria-hidden="true" />}
        accent={summary.activeAlarms > 0 ? 'error' : 'neutral'}
      />
      <StatCard
        label={labels.connectivity}
        value={formatNumber(summary.plcClientsOnline)}
        hint={t('dashboardPage.machineCount', {
          defaultValue: '{{running}} running of {{total}} machines',
          running: summary.running,
          total: summary.totalMachines,
        })}
        icon={<Wifi size={20} aria-hidden="true" />}
        accent="info"
      />
    </div>
  );
}
