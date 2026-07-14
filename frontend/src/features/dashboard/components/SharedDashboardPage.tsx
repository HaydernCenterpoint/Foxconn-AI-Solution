import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTranslation } from 'react-i18next';
import { alarmsApi } from '../../alarms/services/alarms.api';
import { machinesApi } from '../../machines/services/machines.api';
import { linesApi, type ProductionLine } from '../../production-lines/services/lines.api';
import { queryKeys } from '../../../app/queryKeys';
import { queryTimings } from '../../../app/queryOptions';
import { Badge } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { Dropdown } from '../../../shared/components/ui/Dropdown';
import { PageHeader } from '../../../shared/components/ui/PageHeader';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import { ActiveAlarmPanel } from './ActiveAlarmPanel';
import { MachineOeePanel, ProductionTrendPanel } from './DashboardAnalytics';
import { DashboardKpiGrid } from './DashboardKpiGrid';
import { LineOperationsPanel } from './LineOperationsPanel';
import { MachineDrilldownPanel } from './MachineDrilldownPanel';
import { dashboardApi } from '../services/dashboard.api';
import { isApprovedMachine, sortMachines } from './dashboardData';
import './dashboard.css';

export type DashboardRole = 'admin' | 'engineer' | 'viewer';

const EMPTY_LINES: ProductionLine[] = [];

interface SharedDashboardPageProps {
  role?: DashboardRole;
  hideBottomCharts?: boolean;
}

export const SharedDashboardPage = ({ role = 'engineer', hideBottomCharts = false }: SharedDashboardPageProps) => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(null);

  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
    refetchInterval: queryTimings.dashboard,
  });

  const linesQuery = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  const machinesQuery = useQuery({
    queryKey: queryKeys.machines.list(),
    queryFn: machinesApi.getAll,
    refetchInterval: queryTimings.machines,
  });

  const lines = linesQuery.data ?? EMPTY_LINES;
  const activeLine = useMemo<ProductionLine | null>(() => {
    if (lines.length === 0) return null;
    return lines.find((line) => line.id === selectedLineId) ?? lines[0];
  }, [lines, selectedLineId]);

  const lineMachinesQuery = useQuery({
    queryKey: queryKeys.lines.machines(activeLine?.id ?? 'unselected'),
    queryFn: () => {
      if (!activeLine) return Promise.resolve([]);
      return linesApi.getMachines(activeLine.id);
    },
    enabled: Boolean(activeLine),
    refetchInterval: queryTimings.machines,
  });

  const lineMachines = useMemo(
    () => sortMachines((lineMachinesQuery.data ?? []).filter(isApprovedMachine)),
    [lineMachinesQuery.data],
  );

  const selectedMachine = useMemo(
    () => lineMachines.find((machine) => selectedMachineKey === `${activeLine?.id ?? ''}:${machine.id}`) ?? lineMachines[0] ?? null,
    [activeLine?.id, lineMachines, selectedMachineKey],
  );

  const machineHistoryQuery = useQuery({
    queryKey: queryKeys.machines.hourlyProduction(selectedMachine?.id ?? 'unselected'),
    queryFn: () => {
      if (!selectedMachine) return Promise.resolve([]);
      return machinesApi.getHourlyProduction(selectedMachine.id);
    },
    enabled: Boolean(selectedMachine),
    refetchInterval: queryTimings.machines,
  });

  const alarmsQuery = useQuery({
    queryKey: queryKeys.alarms.list('ACTIVE'),
    queryFn: () => alarmsApi.getAll({ status: 'ACTIVE', limit: 8 }),
    refetchInterval: queryTimings.alarmsActive,
  });

  const lineOptions = useMemo(
    () => lines.map((line) => ({ value: line.id, label: tDynamic(line.name) })),
    [lines, tDynamic],
  );

  const roleLabel = t(`common.roles.${role}`, {
    defaultValue: role === 'viewer' ? 'Viewer' : role === 'admin' ? 'Administrator' : 'Engineer',
  });
  const roleDescription = role === 'viewer'
    ? t('dashboardPage.viewerDescription', { defaultValue: 'Read-only operational overview using reported backend data.' })
    : t('dashboardPage.dashboardDescription', { defaultValue: 'Operational overview using reported backend data.' });

  const lineIsLoading = linesQuery.isLoading || Boolean(activeLine && lineMachinesQuery.isLoading);
  const lineIsError = linesQuery.isError || Boolean(activeLine && lineMachinesQuery.isError);
  const retryLine = () => {
    if (activeLine) {
      void lineMachinesQuery.refetch();
      return;
    }
    void linesQuery.refetch();
  };

  const fallbackRecentAlarms = summaryQuery.data?.recentAlarms;
  const alarmItems = alarmsQuery.data ?? fallbackRecentAlarms ?? [];
  const alarmsAreLoading = alarmsQuery.isLoading && fallbackRecentAlarms === undefined;
  const alarmsAreUnavailable = alarmsQuery.isError && fallbackRecentAlarms === undefined;

  return (
    <div className="dashboard-page">
      <PageHeader
        eyebrow={t('dashboardPage.eyebrow', { defaultValue: 'Operations dashboard' })}
        title={t('dashboardPage.overviewTitle', { defaultValue: 'Production overview' })}
        description={roleDescription}
        actions={(
          <div className="dashboard-page__header-actions">
            <Badge variant={role === 'viewer' ? 'neutral' : 'primary'}>{roleLabel}</Badge>
            {linesQuery.isLoading ? (
              <Badge variant="neutral">{t('dashboardPage.loadingLines', { defaultValue: 'Loading lines' })}</Badge>
            ) : linesQuery.isError ? (
              <Button variant="secondary" size="sm" onClick={() => void linesQuery.refetch()}>
                {t('common.actions.retry', { defaultValue: 'Retry lines' })}
              </Button>
            ) : lineOptions.length > 0 ? (
              <div className="dashboard-page__line-selector">
                <Dropdown
                  value={activeLine?.id ?? ''}
                  onChange={setSelectedLineId}
                  options={lineOptions}
                  labelPrefix={t('common.selectLine', { defaultValue: 'Line' })}
                />
              </div>
            ) : (
              <Badge variant="neutral">{t('dashboardPage.noLines', { defaultValue: 'No production lines' })}</Badge>
            )}
          </div>
        )}
      />

      {!hideBottomCharts && (
        <DashboardKpiGrid
          summary={summaryQuery.data}
          machines={machinesQuery.data}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
          isMachinesLoading={machinesQuery.isLoading}
          isMachinesError={machinesQuery.isError}
          onRetry={() => void summaryQuery.refetch()}
        />
      )}

      <div className="dashboard-main-grid">
        <LineOperationsPanel
          line={activeLine}
          machines={lineMachines}
          isLoading={lineIsLoading}
          isError={lineIsError}
          selectedMachineId={selectedMachine?.id ?? null}
          onSelectMachine={(machineId) => setSelectedMachineKey(`${activeLine?.id ?? ''}:${machineId}`)}
          onRetry={retryLine}
          translateName={tDynamic}
        />
        <MachineDrilldownPanel
          machine={selectedMachine}
          history={machineHistoryQuery.data}
          isHistoryLoading={machineHistoryQuery.isLoading}
          isHistoryError={machineHistoryQuery.isError}
          onRetryHistory={() => void machineHistoryQuery.refetch()}
          translateName={tDynamic}
        />
      </div>

      {hideBottomCharts ? (
        <ActiveAlarmPanel
          alarms={alarmItems}
          isLoading={alarmsAreLoading}
          isError={alarmsAreUnavailable}
          onRetry={() => void alarmsQuery.refetch()}
        />
      ) : (
        <div className="dashboard-analytics-grid">
          <ProductionTrendPanel
            hourlyData={summaryQuery.data?.hourlyData}
            isLoading={summaryQuery.isLoading}
            isError={summaryQuery.isError}
            onRetry={() => void summaryQuery.refetch()}
          />
          <MachineOeePanel
            machines={machinesQuery.data?.filter(isApprovedMachine)}
            isLoading={machinesQuery.isLoading}
            isError={machinesQuery.isError}
            onRetry={() => void machinesQuery.refetch()}
            translateName={tDynamic}
          />
          <ActiveAlarmPanel
            alarms={alarmItems}
            isLoading={alarmsAreLoading}
            isError={alarmsAreUnavailable}
            onRetry={() => void alarmsQuery.refetch()}
          />
        </div>
      )}
    </div>
  );
};

export default SharedDashboardPage;
