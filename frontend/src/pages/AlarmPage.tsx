import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, Clock3, ShieldAlert, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { alarmsApi, type Alarm, type AlarmSeverity, type AlarmStatus } from '../features/alarms/services/alarms.api';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { Modal } from '../shared/components/ui/Modal';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { Badge, type BadgeVariant } from '../shared/components/ui/Badge';
import { StatCard } from '../shared/components/ui/StatCard';
import { Surface } from '../shared/components/ui/Surface';
import { usePermissions } from '../shared/hooks/usePermissions';
import { useDynamicTranslation } from '../shared/lib/translator';
import { useUiStore } from '../shared/store/ui.store';

type AlarmAction = 'acknowledge' | 'resolve';

function severityVariant(severity: AlarmSeverity): BadgeVariant {
  if (severity === 'CRITICAL') return 'error';
  if (severity === 'HIGH') return 'warning';
  if (severity === 'MEDIUM') return 'info';
  return 'neutral';
}

function statusVariant(status: AlarmStatus): BadgeVariant {
  if (status === 'ACTIVE') return 'error';
  if (status === 'ACKNOWLEDGED') return 'warning';
  return 'success';
}

function formatAlarmDate(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

interface AlarmActionControlsProps {
  alarm: Alarm;
  canAcknowledge: boolean;
  busy: boolean;
  onOpen: (alarm: Alarm, action: AlarmAction) => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function AlarmActionControls({ alarm, canAcknowledge, busy, onOpen, t }: AlarmActionControlsProps) {
  if (!canAcknowledge) return null;

  if (alarm.status === 'RESOLVED') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 size={15} aria-hidden="true" />
        {t('alarms.closed', { defaultValue: 'Resolved' })}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {alarm.status === 'ACTIVE' && (
        <Button size="sm" variant="secondary" disabled={busy} startIcon={<ClipboardCheck size={14} aria-hidden="true" />} onClick={() => onOpen(alarm, 'acknowledge')}>
          {t('alarms.ackButton', { defaultValue: 'Acknowledge' })}
        </Button>
      )}
      <Button size="sm" disabled={busy} startIcon={<CheckCircle2 size={14} aria-hidden="true" />} onClick={() => onOpen(alarm, 'resolve')}>
        {t('alarms.resolveButton', { defaultValue: 'Resolve' })}
      </Button>
    </div>
  );
}

export const AlarmPage = () => {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canAcknowledge } = usePermissions();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);

  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<string>('');
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
    queryKey: ['alarms-list-shared', statusFilter, severityFilter],
    queryFn: () => alarmsApi.getAll({
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
    }),
    refetchInterval: 3_000,
  });

  const closeAction = () => {
    if (ackMutation.isPending || resolveMutation.isPending) return;
    setActionAlarm(null);
    setActionType(null);
    setNotes('');
    setActionError('');
  };

  const invalidateAlarmData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['alarms-list-shared'] }),
      queryClient.invalidateQueries({ queryKey: ['alarms-list-machine'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] }),
      queryClient.invalidateQueries({ queryKey: ['line-machines'] }),
      queryClient.invalidateQueries({ queryKey: ['line-machines-diagram'] }),
    ]);
  };

  const ackMutation = useMutation({
    mutationFn: ({ id, actionNotes }: { id: number; actionNotes: string }) => alarmsApi.acknowledge(id, actionNotes),
    onSuccess: async () => {
      await invalidateAlarmData();
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
      await invalidateAlarmData();
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

  const openAction = (alarm: Alarm, action: AlarmAction) => {
    setActionAlarm(alarm);
    setActionType(action);
    setActionError('');
    setNotes('');
  };

  const handleActionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actionAlarm || !actionType) return;

    if (actionType === 'acknowledge') {
      ackMutation.mutate({ id: actionAlarm.id, actionNotes: notes.trim() });
    } else {
      resolveMutation.mutate({ id: actionAlarm.id, actionNotes: notes.trim() });
    }
  };

  const alarms = useMemo(() => alarmsQuery.data ?? [], [alarmsQuery.data]);
  const summary = useMemo(() => ({
    active: alarms.filter((alarm) => alarm.status === 'ACTIVE').length,
    acknowledged: alarms.filter((alarm) => alarm.status === 'ACKNOWLEDGED').length,
    resolved: alarms.filter((alarm) => alarm.status === 'RESOLVED').length,
    critical: alarms.filter((alarm) => alarm.severity === 'CRITICAL').length,
  }), [alarms]);
  const actionBusy = ackMutation.isPending || resolveMutation.isPending;

  const pageHeader = (
    <PageHeader
      eyebrow={t('alarms.eyebrow', { defaultValue: 'Incident response' })}
      title={t('alarms.title', { defaultValue: 'Alarms' })}
      description={t('alarms.subtitle', { defaultValue: 'Review reported incidents and record acknowledgement or resolution notes.' })}
      actions={summary.critical > 0 ? (
        <Badge variant="error" size="lg" dot>{t('alarms.criticalCount', { defaultValue: '{{count}} critical', count: summary.critical })}</Badge>
      ) : undefined}
    />
  );

  const filters = (
    <Surface variant="quiet" padding="md" className="toolbar">
      <Dropdown
        value={statusFilter}
        onChange={setStatusFilter}
        labelPrefix={t('alarms.filterLabel', { defaultValue: 'Status' })}
        options={[
          { value: '', label: t('alarms.filterAllStatus', { defaultValue: 'All statuses' }) },
          { value: 'ACTIVE', label: t('alarms.statusActive', { defaultValue: 'Active' }) },
          { value: 'ACKNOWLEDGED', label: t('alarms.statusAck', { defaultValue: 'Acknowledged' }) },
          { value: 'RESOLVED', label: t('alarms.statusResolved', { defaultValue: 'Resolved' }) },
        ]}
      />
      <Dropdown
        value={severityFilter}
        onChange={setSeverityFilter}
        labelPrefix={t('alarms.severityLabel', { defaultValue: 'Severity' })}
        options={[
          { value: '', label: t('alarms.filterAllSeverity', { defaultValue: 'All severities' }) },
          { value: 'CRITICAL', label: t('alarms.severityCritical', { defaultValue: 'Critical' }) },
          { value: 'HIGH', label: t('alarms.severityHigh', { defaultValue: 'High' }) },
          { value: 'MEDIUM', label: t('alarms.severityMedium', { defaultValue: 'Medium' }) },
          { value: 'LOW', label: t('alarms.severityLow', { defaultValue: 'Low' }) },
        ]}
      />
      <span className="ml-auto text-xs text-text-muted">
        {t('alarms.resultsCount', { defaultValue: '{{count}} reported alarms', count: alarms.length })}
      </span>
    </Surface>
  );

  let alarmContent: React.ReactNode;
  if (alarmsQuery.isLoading) {
    alarmContent = (
      <Surface variant="raised">
        <DataState
          kind="loading"
          title={t('alarms.loading', { defaultValue: 'Loading alarms' })}
          description={t('alarms.loadingDescription', { defaultValue: 'Retrieving incidents matching the current filters.' })}
        />
      </Surface>
    );
  } else if (alarmsQuery.isError) {
    alarmContent = (
      <Surface variant="raised">
        <DataState
          kind="error"
          title={t('alarms.queryErrorTitle', { defaultValue: 'Alarms are unavailable' })}
          description={t('alarms.queryErrorDescription', { defaultValue: 'The alarm service could not be reached. No incident records are shown.' })}
          action={(
            <Button variant="secondary" size="sm" onClick={() => void alarmsQuery.refetch()}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          )}
        />
      </Surface>
    );
  } else if (alarms.length === 0) {
    alarmContent = (
      <Surface variant="raised">
        <DataState
          kind="empty"
          title={t('alarms.emptyTitle', { defaultValue: 'No alarms match the current filters' })}
          description={t('alarms.empty', { defaultValue: 'No reported alarm records are available for this filter combination.' })}
          action={(statusFilter || severityFilter) ? (
            <Button variant="secondary" size="sm" onClick={() => {
              setStatusFilter('');
              setSeverityFilter('');
            }}>
              {t('common.actions.clearFilters', { defaultValue: 'Clear filters' })}
            </Button>
          ) : undefined}
        />
      </Surface>
    );
  } else {
    alarmContent = (
      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('alarms.table.device', { defaultValue: 'Machine' })}</th>
                <th>{t('alarms.table.severity', { defaultValue: 'Severity' })}</th>
                <th>{t('alarms.table.message', { defaultValue: 'Incident' })}</th>
                <th>{t('alarms.table.status', { defaultValue: 'Status' })}</th>
                <th>{t('alarms.table.time', { defaultValue: 'Reported at' })}</th>
                <th>{t('alarms.table.handler', { defaultValue: 'Handler' })}</th>
                {canAcknowledge && <th className="text-right">{t('alarms.table.actions', { defaultValue: 'Actions' })}</th>}
              </tr>
            </thead>
            <tbody>
              {alarms.map((alarm) => (
                <tr key={alarm.id}>
                  <td className="font-semibold text-text-primary">{tDynamic(alarm.machineName) || alarm.machineId}</td>
                  <td><Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge></td>
                  <td className="min-w-64 max-w-xl text-text-secondary">{tDynamic(alarm.message)}</td>
                  <td><Badge variant={statusVariant(alarm.status)} size="sm" dot>{alarm.status}</Badge></td>
                  <td className="whitespace-nowrap font-mono text-xs text-text-secondary">{formatAlarmDate(alarm.createdAt, locale)}</td>
                  <td>
                    {alarm.acknowledgedBy ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 text-sm text-text-primary"><UserRound size={14} aria-hidden="true" />{alarm.acknowledgedBy}</span>
                        {alarm.notes && <p className="max-w-48 truncate text-xs text-text-muted">{tDynamic(alarm.notes)}</p>}
                      </div>
                    ) : (
                      <span className="text-sm text-text-muted">{t('alarms.unhandled', { defaultValue: 'Not acknowledged' })}</span>
                    )}
                  </td>
                  {canAcknowledge && (
                    <td><div className="flex justify-end"><AlarmActionControls alarm={alarm} canAcknowledge={canAcknowledge} busy={actionBusy} onOpen={openAction} t={t} /></div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {alarms.map((alarm) => (
            <Surface key={alarm.id} variant="quiet" padding="md" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary">{tDynamic(alarm.machineName) || alarm.machineId}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-text-muted"><Clock3 size={13} aria-hidden="true" />{formatAlarmDate(alarm.createdAt, locale)}</p>
                </div>
                <Badge variant={severityVariant(alarm.severity)} size="sm">{alarm.severity}</Badge>
              </div>
              <p className="text-sm text-text-secondary">{tDynamic(alarm.message)}</p>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <Badge variant={statusVariant(alarm.status)} size="sm" dot>{alarm.status}</Badge>
                {alarm.acknowledgedBy && <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-text-muted"><UserRound size={13} aria-hidden="true" />{alarm.acknowledgedBy}</span>}
              </div>
              {alarm.notes && <p className="rounded-md bg-surface-1 px-3 py-2 text-xs text-text-secondary">{tDynamic(alarm.notes)}</p>}
              <AlarmActionControls alarm={alarm} canAcknowledge={canAcknowledge} busy={actionBusy} onOpen={openAction} t={t} />
            </Surface>
          ))}
        </div>
      </Surface>
    );
  }

  return (
    <div className="space-y-6">
      {pageHeader}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('alarms.total', { defaultValue: 'Filtered alarms' })} value={alarms.length} accent="info" icon={<ShieldAlert size={20} aria-hidden="true" />} />
        <StatCard label={t('alarms.active', { defaultValue: 'Active' })} value={summary.active} accent="error" />
        <StatCard label={t('alarms.acknowledged', { defaultValue: 'Acknowledged' })} value={summary.acknowledged} accent="warning" />
        <StatCard label={t('alarms.resolved', { defaultValue: 'Resolved' })} value={summary.resolved} accent="success" />
      </div>
      {filters}
      {alarmContent}

      <Modal
        open={Boolean(actionAlarm && actionType)}
        onClose={closeAction}
        title={actionType === 'acknowledge'
          ? t('alarms.actionAckTitle', { defaultValue: 'Acknowledge alarm' })
          : t('alarms.actionResolveTitle', { defaultValue: 'Resolve alarm' })}
        subtitle={t('alarms.actionSubtitle', { defaultValue: 'Record the operational note with this alarm action.' })}
        size="md"
        footer={(
          <>
            <Button variant="secondary" disabled={actionBusy} onClick={closeAction}>
              {t('common.actions.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" form="alarm-action-form" loading={actionBusy}>
              {actionType === 'acknowledge'
                ? t('alarms.ackButton', { defaultValue: 'Acknowledge' })
                : t('alarms.resolveButton', { defaultValue: 'Resolve' })}
            </Button>
          </>
        )}
      >
        <form id="alarm-action-form" className="space-y-4" onSubmit={handleActionSubmit}>
          <Surface variant="quiet" padding="sm" className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{actionAlarm ? tDynamic(actionAlarm.machineName) : ''}</p>
            <p className="text-sm text-text-secondary">{actionAlarm ? tDynamic(actionAlarm.message) : ''}</p>
          </Surface>
          {actionError && <div className="rounded-md border border-error bg-error-container px-3 py-2 text-sm text-error" role="alert">{actionError}</div>}
          <label className="block space-y-2">
            <span className="label-small text-text-secondary">{t('alarms.actionNotes', { defaultValue: 'Operational note' })}</span>
            <textarea
              className="field min-h-28 py-3"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('alarms.actionNotesPlaceholder', { defaultValue: 'Describe the acknowledgement or corrective action.' })}
              required
              rows={4}
            />
          </label>
        </form>
      </Modal>
    </div>
  );
};

export default AlarmPage;
