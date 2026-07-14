import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChartNoAxesCombined,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { alarmsApi, type Alarm } from '../../features/alarms/services/alarms.api';
import { dashboardApi } from '../../features/dashboard/services/dashboard.api';
import {
  averageMachineMetric,
  getAggregateMachineStatus,
  getMachineMetric,
  isApprovedMachine,
  isRecord,
  readFiniteNumber,
  readText,
  sortMachines,
} from '../../features/dashboard/components/dashboardData';
import { machinesApi, type Machine } from '../../features/machines/services/machines.api';
import { linesApi } from '../../features/production-lines/services/lines.api';
import { queryKeys } from '../../app/queryKeys';
import { queryTimings } from '../../app/queryOptions';
import { Badge, type BadgeVariant } from '../../shared/components/ui/Badge';
import { Button } from '../../shared/components/ui/Button';
import { DataState } from '../../shared/components/ui/DataState';
import { Dropdown } from '../../shared/components/ui/Dropdown';
import { IconButton } from '../../shared/components/ui/IconButton';
import { LanguageControl } from '../../shared/components/ui/LanguageControl';
import { LocalizedDateTime } from '../../shared/components/ui/LocalizedDateTime';
import { StatCard } from '../../shared/components/ui/StatCard';
import { StatusBadge } from '../../shared/components/ui/StatusBadge';
import { Surface } from '../../shared/components/ui/Surface';
import { useDynamicTranslation } from '../../shared/lib/translator';
import { formatDateTime, formatNumber } from '../../shared/lib/utils';
import { api } from '../../shared/services/apiClient';
import { useUiStore } from '../../shared/store/ui.store';
import './viewer.css';

interface PresentationPanelProps {
  title: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}

interface ReportPoint {
  label: string;
  output: number;
  target?: number;
}

function PresentationPanel({ title, description, icon, children, className = '' }: PresentationPanelProps) {
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

function getReportPoints(data: unknown): ReportPoint[] {
  if (!isRecord(data) || !Array.isArray(data.chartData)) return [];

  return data.chartData.flatMap((item) => {
    if (!isRecord(item)) return [];
    const label = readText(item.date)
      ?? readText(item.hour)
      ?? (typeof item.hour === 'number' ? String(item.hour) : undefined);
    const output = readFiniteNumber(item.output);
    const target = readFiniteNumber(item.target);

    if (!label || output === undefined) return [];
    return [{ label, output, ...(target === undefined ? {} : { target }) }];
  });
}

function severityVariant(severity: string): BadgeVariant {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'error';
  if (severity === 'MEDIUM') return 'warning';
  return 'neutral';
}

export const SlideshowPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const navigate = useNavigate();
  const { theme, setTheme } = useUiStore();
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
    refetchInterval: queryTimings.dashboard,
  });

  const linesQuery = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  const allMachinesQuery = useQuery({
    queryKey: queryKeys.machines.list(),
    queryFn: machinesApi.getAll,
    refetchInterval: queryTimings.machines,
  });

  const selectedLine = useMemo(
    () => (linesQuery.data ?? []).find((line) => line.id === selectedLineId) ?? null,
    [linesQuery.data, selectedLineId],
  );

  const selectedLineMachinesQuery = useQuery({
    queryKey: queryKeys.lines.machines(selectedLineId === 'all' ? 'all' : selectedLineId),
    queryFn: () => linesApi.getMachines(selectedLineId),
    enabled: selectedLineId !== 'all' && Boolean(selectedLine),
    refetchInterval: queryTimings.machines,
  });

  const reportsQuery = useQuery({
    queryKey: ['reports-daily-slideshow', selectedLineId],
    queryFn: () => api.get('/reports/query', {
      params: {
        timeRange: 'last_7_days',
        lineId: selectedLineId || 'all',
        machineId: 'all',
        groupBy: 'day',
      },
    }).then((response) => response.data),
    refetchInterval: queryTimings.reports,
  });

  const alarmsQuery = useQuery({
    queryKey: queryKeys.alarms.list('ACTIVE'),
    queryFn: () => alarmsApi.getAll({ status: 'ACTIVE', limit: 12 }),
    refetchInterval: queryTimings.alarmsActive,
  });

  const selectedMachinesQuery = selectedLineId === 'all' ? allMachinesQuery : selectedLineMachinesQuery;
  const selectedMachines = useMemo(
    () => sortMachines((selectedMachinesQuery.data ?? []).filter(isApprovedMachine)),
    [selectedMachinesQuery.data],
  );
  const selectedMachineIds = useMemo(() => new Set(selectedMachines.map((machine) => machine.id)), [selectedMachines]);
  const relevantAlarms = useMemo(() => {
    const alarms = alarmsQuery.data ?? [];
    if (selectedLineId === 'all') return alarms;
    return alarms.filter((alarm) => selectedMachineIds.has(alarm.machineId));
  }, [alarmsQuery.data, selectedLineId, selectedMachineIds]);

  const reportSummary = useMemo(() => getReportSummary(reportsQuery.data), [reportsQuery.data]);
  const outputData = useMemo(() => getReportPoints(reportsQuery.data), [reportsQuery.data]);
  const hasTarget = outputData.some((point) => point.target !== undefined);
  const reportedOutput = readFiniteNumber(reportSummary?.totalProduction)
    ?? (selectedLineId === 'all' ? readFiniteNumber(dashboardQuery.data?.totalProduction) : undefined);

  const averageOee = averageMachineMetric(selectedMachines, 'oee');
  const runningCount = selectedMachines.filter((machine) => getAggregateMachineStatus([machine]) === 'running').length;
  const lineStatus = getAggregateMachineStatus(selectedMachines);


  const lineOptions = useMemo(
    () => [
      { value: 'all', label: t('slideshow.all', { defaultValue: 'All lines' }) },
      ...(linesQuery.data ?? []).map((line) => ({ value: line.id, label: tDynamic(line.name) })),
    ],
    [linesQuery.data, t, tDynamic],
  );

  const exitFullscreen = () => {
    if (typeof document === 'undefined') return;
    const exit = document.exitFullscreen;
    if (typeof exit === 'function') {
      void exit.call(document).catch(() => undefined);
    }
  };

  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;

    if (document.fullscreenElement) {
      exitFullscreen();
      return;
    }

    const request = document.documentElement.requestFullscreen;
    if (typeof request === 'function') {
      void request.call(document.documentElement).catch(() => undefined);
    }
  };

  const leaveSlideshow = () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      exitFullscreen();
    }
    navigate('/');
  };

  const outputHint = reportsQuery.isError
    ? t('slideshow.outputUnavailable', { defaultValue: 'Report unavailable' })
    : reportedOutput === undefined
      ? t('slideshow.outputMissing', { defaultValue: 'No reported value' })
      : t('slideshow.outputSource', { defaultValue: 'Report-backed value' });
  const stationHint = selectedMachinesQuery.isError
    ? t('slideshow.stationsUnavailable', { defaultValue: 'Machine service unavailable' })
    : selectedMachines.length === 0
      ? t('slideshow.stationsMissing', { defaultValue: 'No approved stations returned' })
      : t('slideshow.stationsSource', { defaultValue: 'Approved stations only' });
  const alarmSelectionIsLoading = alarmsQuery.isLoading || (selectedLineId !== 'all' && selectedMachinesQuery.isLoading);
  const alarmSelectionIsError = alarmsQuery.isError || (selectedLineId !== 'all' && selectedMachinesQuery.isError);

  return (
    <div className="viewer-slideshow">
      <div className="viewer-slideshow__inner">
        <header className="viewer-slideshow__header">
          <div className="viewer-slideshow__heading">
            <p className="viewer-slideshow__eyebrow">{t('slideshow.eyebrow', { defaultValue: 'Presentation view' })}</p>
            <h1 className="viewer-slideshow__title">
              {selectedLine ? tDynamic(selectedLine.name) : t('slideshow.title', { defaultValue: 'Production overview' })}
            </h1>
            <p className="viewer-slideshow__description">
              {t('slideshow.subtitle', { defaultValue: 'Read-only production data refreshed from backend services.' })}
            </p>
          </div>
          <div className="viewer-slideshow__header-tools">
            <div className="viewer-slideshow__line-selector">
              <Dropdown
                value={selectedLineId}
                onChange={setSelectedLineId}
                options={lineOptions}
                labelPrefix={t('common.selectLine', { defaultValue: 'Line' })}
              />
            </div>
            <LocalizedDateTime showDate={false} />
            <LanguageControl compact />
            <IconButton
              icon={theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              label={t('settings.appearance.theme', { defaultValue: 'Toggle theme' })}
              title={t(theme === 'dark' ? 'settings.appearance.light' : 'settings.appearance.dark', {
                defaultValue: theme === 'dark' ? 'Use light theme' : 'Use dark theme',
              })}
              variant="ghost"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            />
            <IconButton
              icon={isFullscreen ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}
              label={isFullscreen
                ? t('slideshow.exitFullscreen', { defaultValue: 'Exit fullscreen' })
                : t('slideshow.enterFullscreen', { defaultValue: 'Enter fullscreen' })}
              variant="ghost"
              onClick={toggleFullscreen}
            />
            <Button variant="secondary" size="sm" startIcon={<X size={16} aria-hidden="true" />} onClick={leaveSlideshow}>
              {t('common.actions.exit', { defaultValue: 'Exit' })}
            </Button>
          </div>
        </header>

        <div className="viewer-slideshow__line-summary">
          <span className="viewer-slideshow__line-summary-label">
            {t('slideshow.lineState', { defaultValue: 'Selected line state' })}
          </span>
          {selectedMachinesQuery.isLoading ? (
            <span className="viewer-slideshow__line-summary-value">{t('common.status.loading', { defaultValue: 'Loading' })}</span>
          ) : selectedMachinesQuery.isError ? (
            <Button variant="secondary" size="sm" onClick={() => void selectedMachinesQuery.refetch()}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : selectedMachines.length > 0 ? (
            <StatusBadge status={lineStatus} />
          ) : (
            <Badge variant="neutral">{t('slideshow.noLiveLineData', { defaultValue: 'No live station data' })}</Badge>
          )}
          <span className="viewer-slideshow__line-summary-value">
            {selectedLineId === 'all'
              ? t('slideshow.allLines', { defaultValue: 'All production lines' })
              : selectedLine ? tDynamic(selectedLine.name) : t('slideshow.lineUnavailable', { defaultValue: 'Selected line unavailable' })}
          </span>
        </div>

        <div className="viewer-slideshow__metrics">
          <StatCard
            label={t('slideshow.reportedProduction', { defaultValue: 'Reported production' })}
            value={reportedOutput === undefined ? '—' : formatNumber(reportedOutput)}
            hint={outputHint}
            icon={<ChartNoAxesCombined size={20} aria-hidden="true" />}
            accent="primary"
            loading={reportsQuery.isLoading}
          />
          <StatCard
            label={t('slideshow.runningStations', { defaultValue: 'Running stations' })}
            value={selectedMachinesQuery.isLoading ? '' : selectedMachines.length === 0 ? '—' : `${runningCount} / ${selectedMachines.length}`}
            hint={stationHint}
            icon={<Activity size={20} aria-hidden="true" />}
            accent="running"
            loading={selectedMachinesQuery.isLoading}
          />
          <StatCard
            label={t('slideshow.averageOee', { defaultValue: 'Average OEE' })}
            value={averageOee === undefined ? '—' : `${averageOee.toFixed(1)}%`}
            hint={averageOee === undefined
              ? t('slideshow.noOee', { defaultValue: 'No live OEE values' })
              : t('slideshow.oeeSource', { defaultValue: 'Live machine telemetry' })}
            icon={<BarChart3 size={20} aria-hidden="true" />}
            accent="info"
            loading={selectedMachinesQuery.isLoading}
          />
          <StatCard
            label={t('slideshow.activeAlarms', { defaultValue: 'Active alarms' })}
            value={alarmSelectionIsLoading || alarmSelectionIsError ? '—' : formatNumber(relevantAlarms.length)}
            hint={alarmSelectionIsError
              ? t('slideshow.alarmsUnavailable', { defaultValue: 'Alarm or station mapping is unavailable' })
              : t('slideshow.alarmsSource', { defaultValue: 'Alarm service' })}
            icon={<AlertTriangle size={20} aria-hidden="true" />}
            accent={relevantAlarms.length > 0 ? 'error' : 'neutral'}
            loading={alarmSelectionIsLoading}
          />
        </div>

        <div className="viewer-slideshow__grid">
          <PresentationPanel
            title={t('slideshow.outputTrend', { defaultValue: 'Reported output trend' })}
            description={hasTarget
              ? t('slideshow.outputTrendTarget', { defaultValue: 'Output and backend-reported target values.' })
              : t('slideshow.outputTrendNoTarget', { defaultValue: 'No target is shown unless it is returned by the reporting service.' })}
            icon={<ChartNoAxesCombined size={18} />}
            className="viewer-slideshow__output"
          >
            {reportsQuery.isLoading ? (
              <DataState kind="loading" title={t('slideshow.loadingOutput', { defaultValue: 'Loading reported output' })} />
            ) : reportsQuery.isError ? (
              <DataState
                kind="error"
                title={t('slideshow.outputError', { defaultValue: 'Reported output is unavailable' })}
                action={<Button variant="secondary" size="sm" onClick={() => void reportsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
              />
            ) : outputData.length === 0 ? (
              <DataState
                kind="empty"
                title={t('slideshow.outputEmpty', { defaultValue: 'No reported output trend' })}
                description={t('slideshow.outputEmptyDescription', { defaultValue: 'The reporting service returned no chart records for this line selection.' })}
              />
            ) : (
              <div className="viewer-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <ComposedChart data={outputData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="output" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    {hasTarget && <YAxis yAxisId="target" orientation="right" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} width={44} />}
                    <Tooltip />
                    <Bar yAxisId="output" dataKey="output" name={t('slideshow.reportedOutput', { defaultValue: 'Reported output' })} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                    {hasTarget && <Line yAxisId="target" type="monotone" dataKey="target" name={t('slideshow.reportedTarget', { defaultValue: 'Reported target' })} stroke="var(--color-running)" strokeWidth={2} dot={false} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </PresentationPanel>

          <PresentationPanel
            title={t('slideshow.stationOee', { defaultValue: 'Station OEE' })}
            description={t('slideshow.stationOeeDescription', { defaultValue: 'Only stations with reported OEE values are included.' })}
            icon={<BarChart3 size={18} />}
          >
            {selectedMachinesQuery.isLoading ? (
              <DataState kind="loading" title={t('slideshow.loadingStations', { defaultValue: 'Loading stations' })} />
            ) : selectedMachinesQuery.isError ? (
              <DataState
                kind="error"
                title={t('slideshow.stationError', { defaultValue: 'Station data is unavailable' })}
                action={<Button variant="secondary" size="sm" onClick={() => void selectedMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
              />
            ) : <OeeChart machines={selectedMachines} translateName={tDynamic} />}
          </PresentationPanel>

          <PresentationPanel
            title={t('slideshow.stationList', { defaultValue: 'Stations' })}
            description={t('slideshow.stationListDescription', { defaultValue: 'Live status and values returned by the machine service.' })}
            icon={<Activity size={18} />}
          >
            {selectedMachinesQuery.isLoading ? (
              <DataState kind="loading" title={t('slideshow.loadingStationList', { defaultValue: 'Loading station list' })} />
            ) : selectedMachinesQuery.isError ? (
              <DataState
                kind="error"
                title={t('slideshow.stationListError', { defaultValue: 'Station list is unavailable' })}
                action={<Button variant="secondary" size="sm" onClick={() => void selectedMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
              />
            ) : <MachineTable machines={selectedMachines} translateName={tDynamic} />}
          </PresentationPanel>

          <PresentationPanel
            title={t('slideshow.activeAlarmList', { defaultValue: 'Active alarms' })}
            description={t('slideshow.activeAlarmListDescription', { defaultValue: 'Alarm records for the current selection when station mapping is available.' })}
            icon={<AlertTriangle size={18} />}
            className="viewer-slideshow__alarms"
          >
            {selectedLineId !== 'all' && selectedMachinesQuery.isLoading ? (
              <DataState kind="loading" title={t('slideshow.loadingAlarmMapping', { defaultValue: 'Loading station mapping for alarms' })} />
            ) : selectedLineId !== 'all' && selectedMachinesQuery.isError ? (
              <DataState
                kind="error"
                title={t('slideshow.alarmMappingError', { defaultValue: 'Alarm mapping is unavailable for this line' })}
                action={<Button variant="secondary" size="sm" onClick={() => void selectedMachinesQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
              />
            ) : alarmsQuery.isLoading ? (
              <DataState kind="loading" title={t('slideshow.loadingAlarms', { defaultValue: 'Loading active alarms' })} />
            ) : alarmsQuery.isError ? (
              <DataState
                kind="error"
                title={t('slideshow.alarmError', { defaultValue: 'Active alarms are unavailable' })}
                action={<Button variant="secondary" size="sm" onClick={() => void alarmsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
              />
            ) : <AlarmList alarms={relevantAlarms} />}
          </PresentationPanel>
        </div>
      </div>
    </div>
  );
};

function OeeChart({ machines, translateName }: { machines: Machine[]; translateName: (value: string) => string }) {
  const { t } = useTranslation();
  const data = machines
    .map((machine) => ({ name: translateName(machine.name), oee: getMachineMetric(machine, 'oee') }))
    .filter((machine): machine is { name: string; oee: number } => machine.oee !== undefined);

  if (data.length === 0) {
    return (
      <DataState
        kind="empty"
        title={t('slideshow.noOee', { defaultValue: 'No live OEE values' })}
        description={t('slideshow.noOeeDescription', { defaultValue: 'No selected station returned an OEE value in its telemetry.' })}
      />
    );
  }

  return (
    <div className="viewer-chart viewer-chart--compact">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={54} />
          <YAxis domain={[0, 100]} tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={40} />
          <Tooltip />
          <Bar dataKey="oee" name={t('dashboard.kpi.oee')} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MachineTable({ machines, translateName }: { machines: Machine[]; translateName: (value: string) => string }) {
  const { t } = useTranslation();

  if (machines.length === 0) {
    return (
      <DataState
        kind="empty"
        title={t('slideshow.noStations', { defaultValue: 'No approved stations returned' })}
        description={t('slideshow.noStationsDescription', { defaultValue: 'No approved station data is available for this line selection.' })}
      />
    );
  }

  return (
    <div className="viewer-table-wrap">
      <table className="viewer-table">
        <thead>
          <tr>
            <th>{t('slideshow.station', { defaultValue: 'Station' })}</th>
            <th>{t('slideshow.status', { defaultValue: 'Status' })}</th>
            <th>{t('slideshow.output', { defaultValue: 'Output' })}</th>
            <th>{t('dashboard.kpi.oee')}</th>
          </tr>
        </thead>
        <tbody>
          {machines.map((machine) => {
            const output = getMachineMetric(machine, 'output');
            const oee = getMachineMetric(machine, 'oee');
            return (
              <tr key={machine.id}>
                <td>
                  <div className="viewer-table__primary">{translateName(machine.name)}</div>
                  <div className="viewer-table__secondary">{machine.machineCode ?? machine.clientId ?? machine.id}</div>
                </td>
                <td><StatusBadge status={machine.status} size="sm" /></td>
                <td>{output === undefined ? '—' : formatNumber(output)}</td>
                <td>{oee === undefined ? '—' : `${oee.toFixed(1)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AlarmList({ alarms }: { alarms: Alarm[] }) {
  const { t } = useTranslation();

  if (alarms.length === 0) {
    return (
      <DataState
        kind="empty"
        title={t('slideshow.noActiveAlarms', { defaultValue: 'No active alarms reported' })}
        description={t('slideshow.noActiveAlarmsDescription', { defaultValue: 'The alarm service did not return an active alarm for this selection.' })}
      />
    );
  }

  return (
    <div className="viewer-alarm-list">
      {alarms.map((alarm) => (
        <article className="viewer-alarm" key={`${alarm.id}-${alarm.createdAt}`}>
          <div className="viewer-alarm__topline">
            <span className="viewer-alarm__name">{alarm.machineName || alarm.machineId}</span>
            <Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge>
          </div>
          <p className="viewer-alarm__message">{alarm.message}</p>
          <div className="viewer-alarm__meta">
            <time className="viewer-alarm__time" dateTime={alarm.createdAt || undefined}>{formatDateTime(alarm.createdAt)}</time>
            <Badge variant="neutral" size="sm">{alarm.status}</Badge>
          </div>
        </article>
      ))}
    </div>
  );
}

export default SlideshowPage;
