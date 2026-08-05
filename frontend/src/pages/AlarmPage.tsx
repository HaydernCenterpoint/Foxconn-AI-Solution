import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { alarmsApi, type Alarm, type AlarmSeverity } from '../features/alarms/services/alarms.api';
import { useDynamicTranslation } from '../shared/lib/translator';
import { Badge } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { Modal } from '../shared/components/ui/Modal';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { StatCard } from '../shared/components/ui/StatCard';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Surface } from '../shared/components/ui/Surface';
import { usePermissions } from '../shared/hooks/usePermissions';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : fallback;
}

const SEVERITY_VARIANT: Record<AlarmSeverity, 'error' | 'warning' | 'info' | 'neutral'> = {
  CRITICAL: 'error',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export const AlarmPage = () => {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canAcknowledge } = usePermissions();
  const currentLang = i18n.language || 'vi';
  const locale = currentLang === 'zh-CN' || currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'vi-VN';
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  const [actionAlarm, setActionAlarm] = useState<Alarm | null>(null);
  const [actionType, setActionType] = useState<'ack' | 'resolve' | null>(null);
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');

  const { data: alarms = [], isLoading, isError } = useQuery({
    queryKey: ['alarms-list-shared', statusFilter, severityFilter],
    queryFn: () => alarmsApi.getAll({
      status: statusFilter || undefined,
      severity: severityFilter || undefined,
    }),
    refetchInterval: 3000,
  });

  const invalidateAllAlarmsData = () => {
    queryClient.invalidateQueries({ queryKey: ['alarms-list-shared'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['line-machines'] });
    queryClient.invalidateQueries({ queryKey: ['line-machines-diagram'] });
    queryClient.invalidateQueries({ queryKey: ['simulation-all-telemetry'] });
  };

  const ackMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) => alarmsApi.acknowledge(id, notes),
    onSuccess: () => { invalidateAllAlarmsData(); closeAction(); },
    onError: (error) => getActionErrorMessage(error, t('alarms.ackError')),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) => alarmsApi.resolve(id, notes),
    onSuccess: () => { invalidateAllAlarmsData(); closeAction(); },
    onError: (error) => getActionErrorMessage(error, t('alarms.resolveError')),
  });

  const closeAction = () => {
    setActionAlarm(null);
    setActionType(null);
    setNotes('');
    setActionError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionAlarm || !actionType) return;
    if (actionType === 'ack') ackMutation.mutate({ id: actionAlarm.id, notes });
    else resolveMutation.mutate({ id: actionAlarm.id, notes });
  };

  const severityLabel = (s: AlarmSeverity) =>
    t(`alarms.severity${s.charAt(0)}${s.slice(1).toLowerCase()}`);

  const active = alarms.filter(a => a.status === 'ACTIVE').length;
  const acknowledged = alarms.filter(a => a.status === 'ACKNOWLEDGED').length;
  const resolved = alarms.filter(a => a.status === 'RESOLVED').length;
  const critical = alarms.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('alarms.eyebrow')}
        title={t('alarms.title')}
        description={t('alarms.subtitle')}
        actions={critical > 0 ? (
          <Badge variant="error" dot>{t('alarms.criticalCount', { count: critical })}</Badge>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t('alarms.total')} value={alarms.length} accent="neutral" />
        <StatCard label={t('alarms.active')} value={active} accent="error" />
        <StatCard label={t('alarms.acknowledged')} value={acknowledged} accent="warning" />
        <StatCard label={t('alarms.resolved')} value={resolved} accent="success" />
      </div>

      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="panel-header">
          <div>
            <h2 className="title-small text-text-primary">{t('alarms.filtersTitle')}</h2>
            <p className="mt-1 text-xs text-text-muted">{t('alarms.refreshLabel')}</p>
          </div>
          <Badge variant="info" size="sm">{t('alarms.resultsCount', { count: alarms.length })}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">{t('alarms.filterLabel')}</span>
          <Dropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: t('alarms.filterAllStatus') },
              { value: 'ACTIVE', label: t('alarms.statusActive') },
              { value: 'ACKNOWLEDGED', label: t('alarms.statusAck') },
              { value: 'RESOLVED', label: t('alarms.statusResolved') },
            ]}
          />
          <Dropdown
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: '', label: t('alarms.filterAllSeverity') },
              { value: 'CRITICAL', label: t('alarms.severityCritical') },
              { value: 'HIGH', label: t('alarms.severityHigh') },
              { value: 'MEDIUM', label: t('alarms.severityMedium') },
              { value: 'LOW', label: t('alarms.severityLow') },
            ]}
          />
        </div>
      </Surface>

      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="panel-header">
          <div>
            <h2 className="title-small text-text-primary">{t('alarms.title')}</h2>
            <p className="mt-1 text-xs text-text-muted">{t('alarms.viewerSubtitle')}</p>
          </div>
        </div>
        {isLoading ? (
          <DataState kind="loading" title={t('alarms.loading')} description={t('alarms.loadingDescription')} />
        ) : isError ? (
          <DataState kind="error" title={t('alarms.queryErrorTitle')} description={t('alarms.queryErrorDescription')} />
        ) : alarms.length === 0 ? (
          <DataState kind="empty" title={t('alarms.emptyTitle')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-176">
              <thead>
                <tr>
                  <th>{t('alarms.table.device')}</th>
                  <th>{t('alarms.table.severity')}</th>
                  <th>{t('alarms.table.message')}</th>
                  <th>{t('alarms.table.status')}</th>
                  <th>{t('alarms.table.time')}</th>
                  <th>{t('alarms.table.handler')}</th>
                  {canAcknowledge && <th className="text-center">{t('alarms.table.actions')}</th>}
                </tr>
              </thead>
              <tbody>

                {alarms.map(alarm => (
                  <tr key={alarm.id}>
                    <td className="font-medium text-text-primary">{tDynamic(alarm.machineName)}</td>
                    <td><Badge variant={SEVERITY_VARIANT[alarm.severity]} size="sm">{severityLabel(alarm.severity)}</Badge></td>
                    <td className="text-text-secondary">{tDynamic(alarm.message)}</td>
                    <td><StatusBadge status={alarm.status.toLowerCase()} size="sm" /></td>
                    <td className="whitespace-nowrap text-text-secondary">
                      <div className="flex flex-col">
                        <span className="flex items-center gap-1 text-text-primary">
                          <Clock size={12} aria-hidden="true" />
                          {new Date(alarm.createdAt).toLocaleTimeString(locale)}
                        </span>
                        <span className="text-xs text-text-muted">{new Date(alarm.createdAt).toLocaleDateString(locale)}</span>
                      </div>
                    </td>
                    <td className="text-xs">
                      {alarm.acknowledgedBy ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-text-primary">
                            <User size={12} aria-hidden="true" />
                            {alarm.acknowledgedBy}
                          </span>
                          {alarm.notes && <span className="text-text-muted">{tDynamic(alarm.notes)}</span>}
                        </div>
                      ) : (
                        <span className="italic text-text-muted">{t('alarms.unhandled')}</span>
                      )}
                    </td>
                    {canAcknowledge && (
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {alarm.status === 'ACTIVE' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => { setActionAlarm(alarm); setActionType('ack'); }}
                            >
                              {t('alarms.ackButton')}
                            </Button>
                          )}
                          {alarm.status !== 'RESOLVED' && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => { setActionAlarm(alarm); setActionType('resolve'); }}
                            >
                              {t('alarms.resolveButton')}
                            </Button>
                          )}
                          {alarm.status === 'RESOLVED' && (
                            <Badge variant="success" size="sm">
                              <span className="flex items-center gap-1">
                                <CheckCircle size={12} aria-hidden="true" />
                                {t('alarms.closed')}
                              </span>
                            </Badge>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {actionAlarm && actionType && (
        <Modal
          open
          onClose={closeAction}
          title={actionType === 'ack' ? t('alarms.modal.ackTitle') : t('alarms.modal.resolveTitle')}
          subtitle={t('alarms.actionSubtitle')}
          size="md"
          footer={
            <>
              <Button variant="ghost" size="md" type="button" onClick={closeAction}>
                {t('common.actions.cancel')}
              </Button>
              <Button
                variant={actionType === 'ack' ? 'secondary' : 'danger'}
                size="md"
                type="submit"
                form="alarm-action-form"
                loading={ackMutation.isPending || resolveMutation.isPending}
              >
                {actionType === 'ack' ? t('alarms.ackButton') : t('alarms.resolveButton')}
              </Button>
            </>
          }
        >
          <form id="alarm-action-form" onSubmit={handleSubmit} className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs">
              <p className="font-semibold text-text-primary">
                {t('alarms.actionDevice')}: <span className="text-text-primary">{tDynamic(actionAlarm.machineName)}</span>
              </p>
              <p className="text-text-muted">
                {t('alarms.modal.message')}: <span className="text-text-primary">{tDynamic(actionAlarm.message)}</span>
              </p>
            </div>
            {actionError && (
              <div className="rounded-lg border border-error bg-error-container px-3 py-2 text-xs text-error">{actionError}</div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alarms.modal.notes')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('alarms.modal.notesPlaceholder')}
                rows={3}
                required
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-primary resize-none"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AlarmPage;

