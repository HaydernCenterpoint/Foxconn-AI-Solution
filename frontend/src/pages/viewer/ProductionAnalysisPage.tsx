import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChartNoAxesCombined,
  Database,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { alarmsApi, type Alarm } from '../../features/alarms/services/alarms.api';
import { averageMachineMetric, isApprovedMachine, isRecord, readFiniteNumber, readText } from '../../features/dashboard/components/dashboardData';
import { machinesApi } from '../../features/machines/services/machines.api';
import { queryKeys } from '../../app/queryKeys';
import { queryTimings } from '../../app/queryOptions';
import { Badge, type BadgeVariant } from '../../shared/components/ui/Badge';
import { Button } from '../../shared/components/ui/Button';
import { DataState } from '../../shared/components/ui/DataState';
import { PageHeader } from '../../shared/components/ui/PageHeader';
import { StatCard } from '../../shared/components/ui/StatCard';
import { Surface } from '../../shared/components/ui/Surface';
import { useDynamicTranslation } from '../../shared/lib/translator';
import { formatDateTime, formatNumber } from '../../shared/lib/utils';
import { api } from '../../shared/services/apiClient';
import './viewer.css';

type AnalysisPeriod = 'daily' | 'weekly' | 'monthly';

interface ReportChartPoint {
  label: string;
  output: number;
  target?: number;
}

interface ReportMetric {
  label: string;
  value: string;
  accent: 'primary' | 'running' | 'error' | 'info';
}

function AnalysisPanel({
  title,
  description,
  icon,
  children,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface variant="raised" padding="none" className={`viewer-panel ${className}`.trim()}>
      <header className="viewer-panel__header">
        <div className="viewer-panel__heading">
          <span className="viewer-panel__icon" aria-hidden="true">{icon}</span>
          <div>
            <h2 className="viewer-panel__title">{title}</h2>
            {description && <p className="viewer-panel__description">{description}</p>}
          </div>
        </div>
      </header>
      <div className="viewer-panel__body">{children}</div>
    </Surface>
  );
}

function getReportSummary(data: unknown): Record<string, unknown> | undefined {
  if (!isRecord(data)) return undefined;
  return isRecord(data.summary) ? data.summary : undefined;
}

function getReportChart(data: unknown): ReportChartPoint[] {
  if (!isRecord(data) || !Array.isArray(data.chartData)) return [];

  return data.chartData.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = readText(item.hour)
      ?? readText(item.date)
      ?? (typeof item.hour === 'number' ? String(item.hour) : undefined);
    const output = readFiniteNumber(item.output);
    const target = readFiniteNumber(item.target);

    if (!label || output === undefined) return [];
    return [{ label, output, ...(target === undefined ? {} : { target }) }];
  });
}

function getReportMetrics(summary: Record<string, unknown> | undefined, t: ReturnType<typeof useTranslation>['t']): ReportMetric[] {
  if (!summary) return [];

  const metrics = [
    {
      label: t('productionAnalysisPage.reportedProduction', { defaultValue: 'Reported production' }),
      value: readFiniteNumber(summary.totalProduction),
      accent: 'primary' as const,
    },
    {
      label: t('productionAnalysisPage.reportedGood', { defaultValue: 'Reported good output' }),
      value: readFiniteNumber(summary.totalGood),
      accent: 'running' as const,
    },
    {
      label: t('productionAnalysisPage.reportedScrap', { defaultValue: 'Reported scrap' }),
      value: readFiniteNumber(summary.totalScrap),
      accent: 'error' as const,
    },
    {
      label: t('productionAnalysisPage.reportedYield', { defaultValue: 'Reported yield' }),
      value: readFiniteNumber(summary.yieldRate),
      accent: 'info' as const,
      suffix: '%',
    },
  ];

  return metrics.flatMap((metric) => metric.value === undefined
    ? []
    : [{ label: metric.label, value: `${formatNumber(metric.value)}${metric.suffix ?? ''}`, accent: metric.accent }]);
}

function alarmSeverityVariant(severity: string): BadgeVariant {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'error';
  if (severity === 'MEDIUM') return 'warning';
  return 'neutral';
}

function AlarmList({ alarms }: { alarms: Alarm[] }) {
  const { t } = useTranslation();

  if (alarms.length === 0) {
    return (
      <DataState
        kind="empty"
        title={t('productionAnalysisPage.noActiveAlarms', { defaultValue: 'No active alarms reported' })}
        description={t('productionAnalysisPage.noActiveAlarmsDescription', { defaultValue: 'The alarm service did not return any active alarms.' })}
      />
    );
  }

  return (
    <div className="viewer-alarm-list">
      {alarms.map((alarm) => (
        <article className="viewer-alarm" key={`${alarm.id}-${alarm.createdAt}`}>
          <div className="viewer-alarm__topline">
            <span className="viewer-alarm__name">{alarm.machineName || alarm.machineId}</span>
            <Badge variant={alarmSeverityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge>
          </div>
          <p className="viewer-alarm__message">{alarm.message}</p>
          <div className="viewer-alarm__meta">
            <span className="viewer-alarm__time">{formatDateTime(alarm.createdAt)}</span>
            <Badge variant="neutral" size="sm">{alarm.status}</Badge>
          </div>
        </article>
      ))}
    </div>
  );
}

export const ProductionAnalysisPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const [period, setPeriod] = useState<AnalysisPeriod>('daily');

  const reportsQuery = useQuery({
    queryKey: ['reportsQuery-analysis', period],
    queryFn: () => api.get('/reports/query', {
      params: {
        timeRange: period === 'daily' ? 'today' : period === 'weekly' ? 'last_7_days' : 'month',
        lineId: 'all',
        machineId: 'all',
      },
    }).then((response) => response.data),
    refetchInterval: queryTimings.reports,
  });

  const machinesQuery = useQuery({
    queryKey: queryKeys.machines.list(),
    queryFn: machinesApi.getAll,
    refetchInterval: queryTimings.machines,
  });

  const alarmsQuery = useQuery({
    queryKey: queryKeys.alarms.list('ACTIVE'),
    queryFn: () => alarmsApi.getAll({ status: 'ACTIVE', limit: 8 }),
    refetchInterval: queryTimings.alarmsActive,
  });

  const reportSummary = useMemo(() => getReportSummary(reportsQuery.data), [reportsQuery.data]);
  const reportMetrics = useMemo(() => getReportMetrics(reportSummary, t), [reportSummary, t]);
  const outputData = useMemo(() => getReportChart(reportsQuery.data), [reportsQuery.data]);
  const hasReportedTarget = outputData.some((point) => point.target !== undefined);

  const approvedMachines = useMemo(
    () => (machinesQuery.data ?? []).filter(isApprovedMachine),
    [machinesQuery.data],
  );
  const stationOeeData = useMemo(() => approvedMachines
    .map((machine) => ({ name: tDynamic(machine.name), oee: averageMachineMetric([machine], 'oee') }))
    .filter((machine): machine is { name: string; oee: number } => machine.oee !== undefined),
    [approvedMachines, tDynamic],
  );
  const averageOee = averageMachineMetric(approvedMachines, 'oee');
  const averageYield = averageMachineMetric(approvedMachines, 'yieldRate');
  const oeeReportingCount = stationOeeData.length;

  const periodOptions: Array<{ value: AnalysisPeriod; label: string }> = [
    { value: 'daily', label: t('productionAnalysisPage.daily', { defaultValue: 'Daily' }) },
    { value: 'weekly', label: t('productionAnalysisPage.weekly', { defaultValue: 'Weekly' }) },
    { value: 'monthly', label: t('productionAnalysisPage.monthly', { defaultValue: 'Monthly' }) },
  ];

  return (
    <div className="viewer-page">
      <PageHeader
        eyebrow={t('productionAnalysisPage.eyebrow', { defaultValue: 'Reporting workspace' })}
        title={t('productionAnalysisPage.title', { defaultValue: 'Production analysis' })}
        description={t('productionAnalysisPage.subtitle', { defaultValue: 'Report-backed output, OEE, and active alarm information.' })}
        actions={(
          <div className="viewer-page__header-actions">
            <div className="viewer-period-controls" aria-label={t('productionAnalysisPage.periodLabel', { defaultValue: 'Reporting period' })}>
              {periodOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={period === option.value ? 'primary' : 'secondary'}
                  size="sm"
                  aria-pressed={period === option.value}
                  onClick={() => setPeriod(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => void reportsQuery.refetch()}>
              {t('common.actions.refresh', { defaultValue: 'Refresh' })}
            </Button>
          </div>
        )}
      />

      {reportsQuery.isLoading ? (
        <Surface variant="raised">
          <DataState kind="loading" title={t('productionAnalysisPage.loadingSummary', { defaultValue: 'Loading report summary' })} />
        </Surface>
      ) : reportsQuery.isError ? (
        <Surface variant="raised">
          <DataState
            kind="error"
            title={t('productionAnalysisPage.reportError', { defaultValue: 'Production report is unavailable' })}
            description={t('productionAnalysisPage.reportErrorDescription', { defaultValue: 'The reporting service could not be reached.' })}
            action={<Button variant="secondary" size="sm" onClick={() => void reportsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
          />
        </Surface>
      ) : reportMetrics.length === 0 ? (
        <Surface variant="raised">
          <DataState
            kind="empty"
            title={t('productionAnalysisPage.summaryEmpty', { defaultValue: 'No report summary values returned' })}
            description={t('productionAnalysisPage.summaryEmptyDescription', { defaultValue: 'The reporting service returned no production summary for this period.' })}
          />
        </Surface>
      ) : (
        <div className="viewer-analysis__summary">
          {reportMetrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              icon={<Database size={20} aria-hidden="true" />}
              accent={metric.accent}
              hint={t('productionAnalysisPage.reportSource', { defaultValue: 'Reporting service' })}
            />
          ))}
        </div>
      )}

      <div className="viewer-analysis__grid">
        <AnalysisPanel
          title={t('productionAnalysisPage.outputTrendTitle', { defaultValue: 'Reported output trend' })}
          description={hasReportedTarget
            ? t('productionAnalysisPage.outputTrendWithTarget', { defaultValue: 'Output and reported target values for the selected period.' })
            : t('productionAnalysisPage.outputTrendWithoutTarget', { defaultValue: 'Only reported output is available for the selected period.' })}
          icon={<ChartNoAxesCombined size={18} />}
          className="viewer-analysis__trend"
        >
          {reportsQuery.isLoading ? (
            <DataState kind="loading" title={t('productionAnalysisPage.loadingTrend', { defaultValue: 'Loading reported output' })} />
          ) : reportsQuery.isError ? (
            <DataState
              kind="error"
              title={t('productionAnalysisPage.trendError', { defaultValue: 'Reported output is unavailable' })}
              action={<Button variant="secondary" size="sm" onClick={() => void reportsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
            />
          ) : outputData.length === 0 ? (
            <DataState
              kind="empty"
              title={t('productionAnalysisPage.trendEmpty', { defaultValue: 'No output trend returned' })}
              description={t('productionAnalysisPage.trendEmptyDescription', { defaultValue: 'No chart records were returned for the selected period.' })}
            />
          ) : (
            <div className="viewer-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={outputData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="output"
                    name={t('productionAnalysisPage.actualOutput', { defaultValue: 'Reported output' })}
                    stroke="var(--color-primary)"
                    fill="var(--color-primary-light)"
                    strokeWidth={2}
                  />
                  {hasReportedTarget && (
                    <Line
                      type="monotone"
                      dataKey="target"
                      name={t('productionAnalysisPage.targetOutput', { defaultValue: 'Reported target' })}
                      stroke="var(--color-on-surface-variant)"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AnalysisPanel>

        <AnalysisPanel
          title={t('productionAnalysisPage.stationOeeTitle', { defaultValue: 'Station OEE comparison' })}
          description={t('productionAnalysisPage.stationOeeDescription', { defaultValue: 'Only approved stations that report OEE are shown.' })}
          icon={<BarChart3 size={18} />}
        >
          {machinesQuery.isLoading ? (
            <DataState kind="loading" title={t('productionAnalysisPage.loadingMachines', { defaultValue: 'Loading stations' })} />
          ) : machinesQuery.isError ? (
            <DataState
              kind="error"
              title={t('productionAnalysisPage.machineError', { defaultValue: 'Station telemetry is unavailable' })}
              action={<Button variant="secondary" size="sm" onClick={() => void machinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
            />
          ) : stationOeeData.length === 0 ? (
            <DataState
              kind="empty"
              title={t('productionAnalysisPage.stationOeeEmpty', { defaultValue: 'No station OEE values reported' })}
              description={t('productionAnalysisPage.stationOeeEmptyDescription', { defaultValue: 'Stations appear when their PLC telemetry includes an OEE value.' })}
            />
          ) : (
            <div className="viewer-chart viewer-chart--compact">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <BarChart data={stationOeeData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={54} />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={40} />
                  <Tooltip />
                  <Bar dataKey="oee" name="OEE" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AnalysisPanel>

        <AnalysisPanel
          title={t('productionAnalysisPage.liveMachineCoverage', { defaultValue: 'Live machine coverage' })}
          description={t('productionAnalysisPage.liveMachineCoverageDescription', { defaultValue: 'Aggregated only from the approved stations returned by the machine service.' })}
          icon={<Activity size={18} />}
        >
          {machinesQuery.isLoading ? (
            <DataState kind="loading" title={t('productionAnalysisPage.loadingMachineCoverage', { defaultValue: 'Loading machine coverage' })} />
          ) : machinesQuery.isError ? (
            <DataState
              kind="error"
              title={t('productionAnalysisPage.machineCoverageError', { defaultValue: 'Machine coverage is unavailable' })}
              action={<Button variant="secondary" size="sm" onClick={() => void machinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
            />
          ) : approvedMachines.length === 0 ? (
            <DataState
              kind="empty"
              title={t('productionAnalysisPage.noApprovedMachines', { defaultValue: 'No approved stations returned' })}
              description={t('productionAnalysisPage.noApprovedMachinesDescription', { defaultValue: 'No approved stations are available for live metric aggregation.' })}
            />
          ) : (
            <div className="viewer-metric-list">
              <MetricItem label={t('productionAnalysisPage.approvedMachines', { defaultValue: 'Approved stations' })} value={formatNumber(approvedMachines.length)} />
              <MetricItem label={t('productionAnalysisPage.oeeReportingStations', { defaultValue: 'Stations reporting OEE' })} value={formatNumber(oeeReportingCount)} />
              <MetricItem label={t('productionAnalysisPage.averageOee', { defaultValue: 'Average OEE' })} value={averageOee === undefined ? '—' : `${averageOee.toFixed(1)}%`} />
              <MetricItem label={t('productionAnalysisPage.averageYield', { defaultValue: 'Average yield' })} value={averageYield === undefined ? '—' : `${averageYield.toFixed(1)}%`} />
            </div>
          )}
        </AnalysisPanel>

        <AnalysisPanel
          title={t('productionAnalysisPage.activeAlarmsTitle', { defaultValue: 'Active alarms' })}
          description={t('productionAnalysisPage.activeAlarmsDescription', { defaultValue: 'Current records returned by the alarm service.' })}
          icon={<AlertTriangle size={18} />}
        >
          {alarmsQuery.isLoading ? (
            <DataState kind="loading" title={t('productionAnalysisPage.loadingAlarms', { defaultValue: 'Loading active alarms' })} />
          ) : alarmsQuery.isError ? (
            <DataState
              kind="error"
              title={t('productionAnalysisPage.alarmError', { defaultValue: 'Active alarms are unavailable' })}
              action={<Button variant="secondary" size="sm" onClick={() => void alarmsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
            />
          ) : (
            <AlarmList alarms={alarmsQuery.data ?? []} />
          )}
        </AnalysisPanel>
      </div>
    </div>
  );
};

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="viewer-metric-list__item">
      <span className="viewer-metric-list__label">{label}</span>
      <strong className="viewer-metric-list__value">{value}</strong>
    </div>
  );
}

export default ProductionAnalysisPage;
