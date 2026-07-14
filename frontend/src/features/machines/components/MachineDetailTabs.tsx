import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, BarChart3, Clock3, Database, Gauge, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { alarmsApi, type Alarm } from '../../alarms/services/alarms.api';
import { type HourlyProduction, type Machine } from '../services/machines.api';
import { Badge, type BadgeVariant } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { Modal } from '../../../shared/components/ui/Modal';
import { StatCard } from '../../../shared/components/ui/StatCard';
import { Surface } from '../../../shared/components/ui/Surface';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import { useUiStore } from '../../../shared/store/ui.store';

type DetailTab = 'overview' | 'history' | 'alarms';
type AlarmAction = 'acknowledge' | 'resolve';

interface MachineDetailTabsProps {
  machine: Machine;
  history: HourlyProduction[];
  historyIsLoading?: boolean;
  historyIsError?: boolean;
  refetchHistory?: () => void;
  isAdminOrEngineer: boolean;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function formatNumber(value: number | undefined, locale: string, suffix = '') {
  return value === undefined ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function formatDuration(value: number | undefined, t: ReturnType<typeof useTranslation>['t']) {
  if (value === undefined || value < 0) return '—';
  const hours = Math.floor(value / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  if (hours === 0) return `${minutes} ${t('common.time.minuteName', { defaultValue: 'min' })}`;
  return `${hours} ${t('common.time.hourName', { defaultValue: 'h' })} ${minutes} ${t('common.time.minuteName', { defaultValue: 'min' })}`;
}

function severityVariant(severity: Alarm['severity']): BadgeVariant {
  if (severity === 'CRITICAL') return 'error';
  if (severity === 'HIGH') return 'warning';
  if (severity === 'MEDIUM') return 'info';
  return 'neutral';
}

function alarmStatusVariant(status: Alarm['status']): BadgeVariant {
  if (status === 'ACTIVE') return 'error';
  if (status === 'ACKNOWLEDGED') return 'warning';
  return 'success';
}

function formatAlarmTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

export function MachineDetailTabs({
  machine,
  history,
  historyIsLoading = false,
  historyIsError = false,
  refetchHistory,
  isAdminOrEngineer,
}: MachineDetailTabsProps) {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [actionAlarm, setActionAlarm] = useState<Alarm | null>(null);
  const [actionType, setActionType] = useState<AlarmAction | null>(null);
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');

  const locale = i18n.language === 'zh' || i18n.language === 'zh-CN'
    ? 'zh-CN'
    : i18n.language === 'en'
      ? 'en-US'
      : 'vi-VN';

  const alarmsQuery = useQuery({
    queryKey: ['alarms-list-machine', machine.id],
    queryFn: () => alarmsApi.getAll({ limit: 100 }),
    refetchInterval: 3_000,
  });

  const machineAlarms = useMemo(
    () => (alarmsQuery.data ?? []).filter((alarm) => alarm.machineId === machine.id),
    [alarmsQuery.data, machine.id],
  );

  const closeAction = () => {
    if (ackMutation.isPending || resolveMutation.isPending) return;
    setActionAlarm(null);
    setActionType(null);
    setNotes('');
    setActionError('');
  };

  const invalidateAlarms = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['alarms-list-machine', machine.id] }),
      queryClient.invalidateQueries({ queryKey: ['alarms-list-shared'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] }),
    ]);
  };

  const ackMutation = useMutation({
    mutationFn: ({ id, actionNotes }: { id: number; actionNotes: string }) => alarmsApi.acknowledge(id, actionNotes),
    onSuccess: async () => {
      await invalidateAlarms();
      addToast('success', t('alarms.ackSuccess', { defaultValue: 'Alarm acknowledged' }));
      closeAction();
    },
    onError: (error: unknown) => {
      const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const message = responseError || t('alarms.ackError', { defaultValue: 'Unable to acknowledge the alarm' });
      setActionError(message);
      addToast('error', message);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, actionNotes }: { id: number; actionNotes: string }) => alarmsApi.resolve(id, actionNotes),
    onSuccess: async () => {
      await invalidateAlarms();
      addToast('success', t('alarms.resolveSuccess', { defaultValue: 'Alarm resolved' }));
      closeAction();
    },
    onError: (error: unknown) => {
      const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const message = responseError || t('alarms.resolveError', { defaultValue: 'Unable to resolve the alarm' });
      setActionError(message);
      addToast('error', message);
    },
  });

  const telemetry = machine.lastPlcData;
  const reportedOutput = readFiniteNumber(telemetry?.productionCount);
  const reportedOee = readFiniteNumber(telemetry?.production?.oee ?? telemetry?.tags?.oee);
  const reportedUph = readFiniteNumber(telemetry?.production?.uph ?? telemetry?.tags?.uph);
  const reportedCpu = readFiniteNumber(telemetry?.computer?.cpuPercent ?? machine.cpuPercent);
  const reportedRam = readFiniteNumber(telemetry?.computer?.ramPercent ?? machine.ramPercent);
  const reportedRuntime = readFiniteNumber(telemetry?.machineRuntimeSeconds ?? machine.uptimeSeconds);
  const lastReportedAt = telemetry?.timestamp;
  const activeAlarmCount = machineAlarms.filter((alarm) => alarm.status === 'ACTIVE').length;
  const actionBusy = ackMutation.isPending || resolveMutation.isPending;

  const historyRows = useMemo(() => [...history].sort((left, right) => {
    const leftTime = new Date(`${left.prodDate}T${String(left.prodHour).padStart(2, '0')}:00:00`).getTime();
    const rightTime = new Date(`${right.prodDate}T${String(right.prodHour).padStart(2, '0')}:00:00`).getTime();
    return rightTime - leftTime;
  }), [history]);

  const handleAlarmActionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionAlarm || !actionType) return;
    const actionNotes = notes.trim();
    if (actionType === 'acknowledge') {
      ackMutation.mutate({ id: actionAlarm.id, actionNotes });
    } else {
      resolveMutation.mutate({ id: actionAlarm.id, actionNotes });
    }
  };

  const tabClass = (tab: DetailTab) => (
    `flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
      activeTab === tab
        ? 'border-primary bg-primary-light text-primary'
        : 'border-transparent text-text-secondary hover:bg-surface-3 hover:text-text-primary'
    }`
  );

  return (
    <div className="space-y-6">
      <nav className="overflow-x-auto border-b border-border" aria-label={t('machines.detail.tabs', { defaultValue: 'Machine details' })}>
        <div className="flex min-w-max">
          <button type="button" className={tabClass('overview')} onClick={() => setActiveTab('overview')}>
            <Activity size={16} aria-hidden="true" />
            {t('machines.detail.tabHome', { defaultValue: 'Overview' })}
          </button>
          <button type="button" className={tabClass('history')} onClick={() => setActiveTab('history')}>
            <BarChart3 size={16} aria-hidden="true" />
            {t('machines.detail.tabAnalysis', { defaultValue: 'Production history' })}
          </button>
          <button type="button" className={tabClass('alarms')} onClick={() => setActiveTab('alarms')}>
            <AlertTriangle size={16} aria-hidden="true" />
            {t('machines.detail.tabErrors', { defaultValue: 'Alarms' })}
            {activeAlarmCount > 0 && <Badge variant="error" size="sm">{activeAlarmCount}</Badge>}
          </button>
        </div>
      </nav>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('machines.detail.reportedOutput', { defaultValue: 'Reported output' })}
              value={formatNumber(reportedOutput, locale)}
              icon={<Database size={20} aria-hidden="true" />}
              accent="primary"
              hint={t('machines.detail.latestPlcSample', { defaultValue: 'Latest PLC sample' })}
            />
            <StatCard
              label={t('machines.detail.oeeTitle', { defaultValue: 'Reported OEE' })}
              value={formatNumber(reportedOee, locale, '%')}
              icon={<Gauge size={20} aria-hidden="true" />}
              accent="info"
              hint={t('machines.detail.latestPlcSample', { defaultValue: 'Latest PLC sample' })}
            />
            <StatCard
              label={t('machines.detail.uphTitle', { defaultValue: 'Reported UPH' })}
              value={formatNumber(reportedUph, locale)}
              icon={<Activity size={20} aria-hidden="true" />}
              accent="running"
              hint={t('machines.detail.latestPlcSample', { defaultValue: 'Latest PLC sample' })}
            />
            <StatCard
              label={t('machines.detail.activeAlarms', { defaultValue: 'Active alarms' })}
              value={activeAlarmCount}
              icon={<ShieldAlert size={20} aria-hidden="true" />}
              accent="error"
              hint={t('machines.detail.alarmSource', { defaultValue: 'Alarm service' })}
            />
          </div>

          <Surface variant="raised" padding="none" className="overflow-hidden">
            <div className="panel-header">
              <div>
                <h2 className="title-small text-text-primary">{t('machines.detail.latestRecordTitle', { defaultValue: 'Latest machine record' })}</h2>
                <p className="mt-1 text-xs text-text-muted">
                  {lastReportedAt
                    ? `${t('machines.detail.lastReportedAt', { defaultValue: 'Last PLC timestamp' })}: ${formatAlarmTime(lastReportedAt, locale)}`
                    : t('machines.detail.noPlcTimestamp', { defaultValue: 'No PLC timestamp was reported with this machine record.' })}
                </p>
              </div>
            </div>
            {telemetry ? (
              <dl className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-surface p-4">
                  <dt className="text-xs text-text-muted">{t('machines.detail.cpu', { defaultValue: 'Reported CPU' })}</dt>
                  <dd className="mt-2 font-mono text-lg font-semibold text-text-primary">{formatNumber(reportedCpu, locale, '%')}</dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-xs text-text-muted">{t('machines.detail.ram', { defaultValue: 'Reported RAM' })}</dt>
                  <dd className="mt-2 font-mono text-lg font-semibold text-text-primary">{formatNumber(reportedRam, locale, '%')}</dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-xs text-text-muted">{t('machines.detail.runtime', { defaultValue: 'Reported runtime' })}</dt>
                  <dd className="mt-2 text-lg font-semibold text-text-primary">{formatDuration(reportedRuntime, t)}</dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-xs text-text-muted">{t('machines.detail.plcConnection', { defaultValue: 'PLC connection' })}</dt>
                  <dd className="mt-2"><Badge variant={machine.plcConnected ? 'success' : 'offline'} size="sm" dot>{machine.plcConnected ? t('machines.plcConnected', { defaultValue: 'Connected' }) : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}</Badge></dd>
                </div>
              </dl>
            ) : (
              <DataState
                kind="empty"
                title={t('machines.detail.noTelemetryTitle', { defaultValue: 'No PLC payload reported' })}
                description={t('machines.detail.noTelemetryDescription', { defaultValue: 'The machine record does not currently include a latest PLC payload.' })}
              />
            )}
          </Surface>
        </div>
      )}

      {activeTab === 'history' && (
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('machines.detail.hourlyProduction', { defaultValue: 'Hourly production history' })}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('machines.detail.hourlyProductionDescription', { defaultValue: 'Historical rows supplied by the machine service.' })}</p>
            </div>
          </div>
          {historyIsLoading ? (
            <DataState kind="loading" title={t('machines.detail.historyLoading', { defaultValue: 'Loading production history' })} />
          ) : historyIsError ? (
            <DataState
              kind="error"
              title={t('machines.detail.historyError', { defaultValue: 'Production history is unavailable' })}
              description={t('machines.detail.historyErrorDescription', { defaultValue: 'The machine service did not return production history.' })}
              action={refetchHistory ? <Button variant="secondary" size="sm" onClick={refetchHistory}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button> : undefined}
            />
          ) : historyRows.length === 0 ? (
            <DataState
              kind="empty"
              title={t('machines.detail.historyEmpty', { defaultValue: 'No hourly production rows reported' })}
              description={t('machines.detail.historyEmptyDescription', { defaultValue: 'This endpoint has not returned historical production for the machine.' })}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="data-table">
                  <thead><tr>
                    <th>{t('machines.detail.historyDate', { defaultValue: 'Date' })}</th>
                    <th>{t('machines.detail.historyHour', { defaultValue: 'Hour' })}</th>
                    <th className="text-right">{t('machines.detail.historyOutput', { defaultValue: 'Hourly output' })}</th>
                    <th className="text-right">{t('machines.detail.historyCpu', { defaultValue: 'Average CPU' })}</th>
                    <th className="text-right">{t('machines.detail.historyRam', { defaultValue: 'Average RAM' })}</th>
                    <th>{t('machines.detail.historyReceived', { defaultValue: 'Received at' })}</th>
                  </tr></thead>
                  <tbody>{historyRows.map((row) => <tr key={`${row.prodDate}-${row.prodHour}-${row.receivedAt}`}>
                    <td>{row.prodDate}</td>
                    <td className="font-mono">{String(row.prodHour).padStart(2, '0')}:00</td>
                    <td className="text-right font-mono">{formatNumber(readFiniteNumber(row.hourlyQty), locale)}</td>
                    <td className="text-right font-mono">{formatNumber(readFiniteNumber(row.avgCpu), locale, '%')}</td>
                    <td className="text-right font-mono">{formatNumber(readFiniteNumber(row.avgRam), locale, '%')}</td>
                    <td className="font-mono text-xs text-text-secondary">{formatAlarmTime(row.receivedAt, locale)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="space-y-3 p-3 md:hidden">{historyRows.map((row) => <Surface key={`${row.prodDate}-${row.prodHour}-${row.receivedAt}`} variant="quiet" padding="md" className="space-y-3">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-text-primary">{row.prodDate}</p><p className="mt-1 font-mono text-xs text-text-muted">{String(row.prodHour).padStart(2, '0')}:00</p></div><span className="font-mono text-lg font-semibold text-text-primary">{formatNumber(readFiniteNumber(row.hourlyQty), locale)}</span></div>
                <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-text-muted">{t('machines.detail.historyCpu', { defaultValue: 'Average CPU' })}</dt><dd className="mt-1 font-mono text-text-primary">{formatNumber(readFiniteNumber(row.avgCpu), locale, '%')}</dd></div><div><dt className="text-xs text-text-muted">{t('machines.detail.historyRam', { defaultValue: 'Average RAM' })}</dt><dd className="mt-1 font-mono text-text-primary">{formatNumber(readFiniteNumber(row.avgRam), locale, '%')}</dd></div></dl>
              </Surface>)}</div>
            </>
          )}
        </Surface>
      )}

      {activeTab === 'alarms' && (
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('machines.detail.machineAlarms', { defaultValue: 'Machine alarms' })}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('machines.detail.machineAlarmsDescription', { defaultValue: 'Alarm records filtered to this machine.' })}</p>
            </div>
            {activeAlarmCount > 0 && <Badge variant="error" size="sm" dot>{activeAlarmCount}</Badge>}
          </div>
          {alarmsQuery.isLoading ? (
            <DataState kind="loading" title={t('alarms.loading', { defaultValue: 'Loading alarms' })} />
          ) : alarmsQuery.isError ? (
            <DataState
              kind="error"
              title={t('machines.detail.alarmError', { defaultValue: 'Machine alarms are unavailable' })}
              description={t('machines.detail.alarmErrorDescription', { defaultValue: 'The alarm service could not be reached.' })}
              action={<Button variant="secondary" size="sm" onClick={() => void alarmsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
            />
          ) : machineAlarms.length === 0 ? (
            <DataState
              kind="empty"
              title={t('machines.detail.alarmEmpty', { defaultValue: 'No alarms reported for this machine' })}
              description={t('machines.detail.alarmEmptyDescription', { defaultValue: 'The alarm service returned no records linked to this machine.' })}
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="data-table">
                  <thead><tr><th>{t('alarms.table.severity', { defaultValue: 'Severity' })}</th><th>{t('alarms.table.message', { defaultValue: 'Incident' })}</th><th>{t('alarms.table.status', { defaultValue: 'Status' })}</th><th>{t('alarms.table.time', { defaultValue: 'Reported at' })}</th>{isAdminOrEngineer && <th className="text-right">{t('alarms.table.actions', { defaultValue: 'Actions' })}</th>}</tr></thead>
                  <tbody>{machineAlarms.map((alarm) => <tr key={alarm.id}>
                    <td><Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge></td>
                    <td className="min-w-64 text-text-secondary">{tDynamic(alarm.message)}</td>
                    <td><Badge variant={alarmStatusVariant(alarm.status)} size="sm" dot>{alarm.status}</Badge></td>
                    <td className="font-mono text-xs text-text-secondary">{formatAlarmTime(alarm.createdAt, locale)}</td>
                    {isAdminOrEngineer && <td><div className="flex justify-end gap-2">{alarm.status === 'ACTIVE' && <Button variant="secondary" size="sm" disabled={actionBusy} onClick={() => { setActionAlarm(alarm); setActionType('acknowledge'); setNotes(''); setActionError(''); }}>{t('alarms.ackButton', { defaultValue: 'Acknowledge' })}</Button>}{alarm.status !== 'RESOLVED' && <Button size="sm" disabled={actionBusy} onClick={() => { setActionAlarm(alarm); setActionType('resolve'); setNotes(''); setActionError(''); }}>{t('alarms.resolveButton', { defaultValue: 'Resolve' })}</Button>}</div></td>}
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="space-y-3 p-3 md:hidden">{machineAlarms.map((alarm) => <Surface key={alarm.id} variant="quiet" padding="md" className="space-y-3">
                <div className="flex items-start justify-between gap-3"><Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge><Badge variant={alarmStatusVariant(alarm.status)} size="sm" dot>{alarm.status}</Badge></div>
                <p className="text-sm text-text-secondary">{tDynamic(alarm.message)}</p>
                <p className="flex items-center gap-1 text-xs text-text-muted"><Clock3 size={13} aria-hidden="true" />{formatAlarmTime(alarm.createdAt, locale)}</p>
                {isAdminOrEngineer && alarm.status !== 'RESOLVED' && <div className="flex flex-wrap gap-2">{alarm.status === 'ACTIVE' && <Button variant="secondary" size="sm" disabled={actionBusy} onClick={() => { setActionAlarm(alarm); setActionType('acknowledge'); setNotes(''); setActionError(''); }}>{t('alarms.ackButton', { defaultValue: 'Acknowledge' })}</Button>}<Button size="sm" disabled={actionBusy} onClick={() => { setActionAlarm(alarm); setActionType('resolve'); setNotes(''); setActionError(''); }}>{t('alarms.resolveButton', { defaultValue: 'Resolve' })}</Button></div>}
              </Surface>)}</div>
            </>
          )}
        </Surface>
      )}

      <Modal
        open={Boolean(actionAlarm && actionType)}
        onClose={closeAction}
        title={actionType === 'acknowledge'
          ? t('alarms.actionAckTitle', { defaultValue: 'Acknowledge alarm' })
          : t('alarms.actionResolveTitle', { defaultValue: 'Resolve alarm' })}
        subtitle={t('alarms.actionSubtitle', { defaultValue: 'Record the operational note with this alarm action.' })}
        size="md"
        footer={<><Button variant="secondary" disabled={actionBusy} onClick={closeAction}>{t('common.actions.cancel', { defaultValue: 'Cancel' })}</Button><Button type="submit" form="machine-alarm-action" loading={actionBusy}>{actionType === 'acknowledge' ? t('alarms.ackButton', { defaultValue: 'Acknowledge' }) : t('alarms.resolveButton', { defaultValue: 'Resolve' })}</Button></>}
      >
        <form id="machine-alarm-action" className="space-y-4" onSubmit={handleAlarmActionSubmit}>
          <Surface variant="quiet" padding="sm"><p className="text-sm text-text-secondary">{actionAlarm ? tDynamic(actionAlarm.message) : ''}</p></Surface>
          {actionError && <div className="rounded-md border border-error bg-error-container px-3 py-2 text-sm text-error" role="alert">{actionError}</div>}
          <label className="block space-y-2"><span className="label-small text-text-secondary">{t('alarms.actionNotes', { defaultValue: 'Operational note' })}</span><textarea className="field min-h-28 py-3" value={notes} onChange={(event) => setNotes(event.target.value)} required rows={4} /></label>
        </form>
      </Modal>
    </div>
  );
}
