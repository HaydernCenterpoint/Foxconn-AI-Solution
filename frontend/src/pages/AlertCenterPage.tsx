import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Info,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../app/queryKeys';
import {
  predictiveAlertsApi,
  type PredictiveAlert,
  type RootCauseAnalysis,
} from '../features/dashboard/services/predictiveAlerts.api';
import { usePermissions } from '../shared/hooks/usePermissions';
import { Badge } from '../shared/components/ui/Badge';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { Modal } from '../shared/components/ui/Modal';
import { StatCard } from '../shared/components/ui/StatCard';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { TechPanel } from '../shared/components/ui/TechPanel';
import './modern-alarms.css';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : fallback;
}

function toCsv(alerts: PredictiveAlert[]): string {
  const header = [
    'alert_id',
    'timestamp',
    'asset_id',
    'severity',
    'status',
    'title',
    'description',
    'rule',
    'acknowledged_by',
    'resolved_by',
  ];
  const rows = alerts.map((alert) =>
    [
      alert.alert_id,
      alert.timestamp,
      alert.asset_id,
      alert.severity,
      alert.status,
      alert.title,
      alert.description,
      alert.event_type,
      alert.acknowledged_by ?? '',
      alert.resolved_by ?? '',
    ]
      .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
      .join(','),
  );
  return [header.join(','), ...rows].join('\n');
}

function AlertEvidence({ evidence }: { evidence?: string | null }) {
  if (!evidence) {
    return <span className="text-text-muted">—</span>;
  }

  let entries: Array<[string, unknown]> | null = null;
  try {
    const parsed = JSON.parse(evidence) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      entries = Object.entries(parsed);
    }
  } catch {
    // Evidence from older alerts may be plain text.
  }

  if (entries) {
    return (
      <dl className="grid gap-1 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded border border-border bg-surface-1 px-2 py-1.5">
            <dt className="font-mono text-[10px] uppercase text-text-muted">{key}</dt>
            <dd className="break-words text-xs text-text-secondary">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <span className="whitespace-pre-wrap text-xs text-text-secondary">{evidence}</span>;
}

function RcaPanel({
  analysis,
  isLoading,
  isError,
}: {
  analysis: RootCauseAnalysis | null | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation();
  const rawConfidence = analysis
    ? analysis.confidence_score <= 1
      ? analysis.confidence_score * 100
      : analysis.confidence_score
    : 0;
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(100, Math.max(0, Math.round(rawConfidence)))
    : 0;
  const causalChain = analysis?.causal_chain_events.length
    ? analysis.causal_chain_events.map((event) => event.type.replaceAll('_', ' '))
    : analysis?.causal_chain ?? [];

  return (
    <section
      aria-label={t('alertCenter.rca.title')}
      className="rounded-lg border border-border bg-surface-2 p-3"
    >
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
        {t('alertCenter.rca.title')}
      </h3>
      {isLoading ? (
        <p role="status" className="mt-2 text-xs text-text-muted">
          {t('alertCenter.rca.loading')}
        </p>
      ) : isError ? (
        <p role="alert" className="mt-2 text-xs text-error">
          {t('alertCenter.rca.error')}
        </p>
      ) : !analysis ? (
        <p className="mt-2 text-xs text-text-muted">{t('alertCenter.rca.unavailable')}</p>
      ) : (
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {t('alertCenter.rca.rootCause')}
            </p>
            <p className="mt-1 text-xs font-semibold text-text-primary">
              {analysis.root_cause_description}
            </p>
            <p className="mt-1 font-mono text-[11px] text-text-secondary">
              {analysis.root_cause_type} · {analysis.root_cause_asset_id}
            </p>
            <p className="mt-2 text-xs text-text-secondary">
              {t('alertCenter.rca.confidence')}: <strong>{confidence}%</strong>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t('alertCenter.rca.causalChain')}
              </p>
              {causalChain.length > 0 ? (
                <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-text-secondary">
                  {causalChain.map((item, index) => (
                    <li key={`${index}-${item}`} className="capitalize">{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-1 text-xs text-text-muted">{t('alertCenter.rca.none')}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {t('alertCenter.rca.actions')}
              </p>
              {analysis.recommended_actions.length > 0 ? (
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-text-secondary">
                  {analysis.recommended_actions.map((action, index) => (
                    <li key={`${index}-${action}`}>{action}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-text-muted">{t('alertCenter.rca.none')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      <p className="mt-3 border-t border-border pt-2 text-[11px] text-text-muted">
        {t('alertCenter.rca.basicCorrelationNote')}
      </p>
    </section>
  );
}

export default function AlertCenterPage() {
  const { t, i18n } = useTranslation();
  const { canAcknowledge } = usePermissions();
  const currentLang = i18n.language || 'vi';
  const locale =
    currentLang === 'zh-CN' || currentLang === 'zh'
      ? 'zh-CN'
      : currentLang === 'en'
        ? 'en-US'
        : 'vi-VN';
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [actionAlert, setActionAlert] = useState<PredictiveAlert | null>(null);
  const [actionType, setActionType] = useState<'ack' | 'resolve' | null>(null);
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: queryKeys.predictiveAlerts.list(statusFilter, severityFilter),
    queryFn: () =>
      predictiveAlertsApi.listAlerts({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        limit: 200,
      }),
    refetchInterval: 5000,
  });

  const { data: expandedAlert, isLoading: isEvidenceLoading } = useQuery({
    queryKey: queryKeys.predictiveAlerts.detail(expandedId ?? ''),
    queryFn: () => predictiveAlertsApi.getAlert(expandedId!),
    enabled: !!expandedId,
  });

  const selectedAlert = alerts.find((alert) => alert.alert_id === expandedId);
  const {
    data: rcaResponse,
    isLoading: isRcaLoading,
    isError: isRcaError,
  } = useQuery({
    queryKey: queryKeys.predictiveAlerts.rca(expandedId ?? ''),
    queryFn: () => predictiveAlertsApi.getRca(selectedAlert!),
    enabled: canAcknowledge && !!expandedId && !!selectedAlert,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['predictive-alerts'] });
  };

  const ackMutation = useMutation({
    mutationFn: ({ id, notes: actionNotes }: { id: string; notes: string }) =>
      predictiveAlertsApi.acknowledgeAlert(id, actionNotes),
    onSuccess: () => {
      invalidate();
      closeAction();
    },
    onError: (error) => setActionError(getActionErrorMessage(error, t('alertCenter.ackFailed'))),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes: actionNotes }: { id: string; notes: string }) =>
      predictiveAlertsApi.resolveAlert(id, actionNotes),
    onSuccess: () => {
      invalidate();
      closeAction();
    },
    onError: (error) => setActionError(getActionErrorMessage(error, t('alertCenter.resolveFailed'))),
  });

  const closeAction = () => {
    setActionAlert(null);
    setActionType(null);
    setNotes('');
    setActionError('');
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!actionAlert || !actionType) return;
    if (actionType === 'ack') ackMutation.mutate({ id: actionAlert.alert_id, notes });
    else resolveMutation.mutate({ id: actionAlert.alert_id, notes });
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(alerts)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cep-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const severityConfig: Record<
    string,
    { label: string; icon: React.ReactNode; variant: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' }
  > = {
    CRITICAL: { label: t('alertCenter.severityCritical'), icon: <ShieldAlert className="h-3.5 w-3.5" />, variant: 'error' },
    EMERGENCY: { label: t('alertCenter.severityEmergency'), icon: <ShieldAlert className="h-3.5 w-3.5" />, variant: 'error' },
    HIGH: { label: t('alertCenter.severityHigh'), icon: <AlertTriangle className="h-3.5 w-3.5" />, variant: 'warning' },
    WARNING: { label: t('alertCenter.severityWarning'), icon: <AlertTriangle className="h-3.5 w-3.5" />, variant: 'warning' },
    MEDIUM: { label: t('alertCenter.severityMedium'), icon: <AlertOctagon className="h-3.5 w-3.5" />, variant: 'info' },
    INFO: { label: t('alertCenter.severityInfo'), icon: <Info className="h-3.5 w-3.5" />, variant: 'info' },
    LOW: { label: t('alertCenter.severityLow'), icon: <Info className="h-3.5 w-3.5" />, variant: 'neutral' },
  };

  const getSev = (severity: string) =>
    severityConfig[severity.toUpperCase()] ?? severityConfig.LOW;

  const openCount = alerts.filter((a) => a.status.toLowerCase() === 'open').length;
  const ackCount = alerts.filter((a) => a.status.toLowerCase() === 'acknowledged').length;
  const resolvedCount = alerts.filter((a) => a.status.toLowerCase() === 'resolved').length;
  const criticalCount = alerts.filter((a) =>
    ['critical', 'emergency'].includes(a.severity.toLowerCase()),
  ).length;

  return (
    <div className="modern-alarms space-y-6">
      <header className="modern-alarms__header">
        <div>
          <p className="modern-alarms__eyebrow">{t('alertCenter.eyebrow')}</p>
          <h1 className="modern-alarms__title">
            <span className="modern-alarms__title-mark" aria-hidden="true" />
            {t('alertCenter.title')}
          </h1>
          <p className="modern-alarms__subtitle">{t('alertCenter.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {criticalCount > 0 && (
            <Badge variant="error" dot className="modern-alarms__critical px-3.5 py-2 text-xs font-bold">
              {criticalCount} {t('alertCenter.criticalLabel')}
            </Badge>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-3"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t('alertCenter.exportCsv')}
          </button>
        </div>
      </header>

      <div className="modern-alarms__stat-grid">
        <StatCard label={t('alertCenter.total')} value={alerts.length} accent="neutral" />
        <StatCard label={t('alertCenter.open')} value={openCount} accent="error" />
        <StatCard label={t('alertCenter.acknowledged')} value={ackCount} accent="warning" />
        <StatCard label={t('alertCenter.resolved')} value={resolvedCount} accent="success" />
      </div>

      <TechPanel
        title={t('alertCenter.filtersTitle')}
        extraHeader={
          <span className="modern-alarms__result-count">
            {alerts.length} {t('alertCenter.resultsLabel')} · {t('alertCenter.refreshLabel')}
          </span>
        }
      >
        <div className="modern-alarms__filter-row">
          <span className="modern-alarms__filter-label">{t('alertCenter.filterLabel')}</span>
          <Dropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: t('alertCenter.filterAllStatus') },
              { value: 'open', label: t('alertCenter.statusOpen') },
              { value: 'acknowledged', label: t('alertCenter.statusAck') },
              { value: 'resolved', label: t('alertCenter.statusResolved') },
              { value: 'suppressed', label: t('alertCenter.statusSuppressed') },
            ]}
          />
          <Dropdown
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: '', label: t('alertCenter.filterAllSeverity') },
              { value: 'CRITICAL', label: t('alertCenter.severityCritical') },
              { value: 'EMERGENCY', label: t('alertCenter.severityEmergency') },
              { value: 'WARNING', label: t('alertCenter.severityWarning') },
              { value: 'HIGH', label: t('alertCenter.severityHigh') },
              { value: 'INFO', label: t('alertCenter.severityInfo') },
            ]}
          />
        </div>
      </TechPanel>

      {canAcknowledge && (
        <Modal
          open={!!actionAlert && !!actionType}
          onClose={closeAction}
          title={
            actionType === 'ack'
              ? t('alertCenter.actionAckTitle')
              : t('alertCenter.actionResolveTitle')
          }
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={closeAction}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-3"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                form="alert-center-action-form"
                disabled={ackMutation.isPending || resolveMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {actionType === 'ack' ? t('alertCenter.ackButton') : t('alertCenter.resolveButton')}
              </button>
            </>
          }
        >
          <form id="alert-center-action-form" onSubmit={handleSubmit} className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs">
              <p className="font-semibold text-text-primary">
                {t('alertCenter.actionAsset')}:{' '}
                <span className="font-mono text-text-primary">{actionAlert?.asset_id}</span>
              </p>
              <p className="text-text-muted">
                {t('alertCenter.actionIssue')}: {actionAlert?.title}
              </p>
            </div>
            {actionError && (
              <div className="rounded-lg border border-error bg-error-container px-3 py-2 text-xs text-error">
                {actionError}
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alertCenter.actionNotes')}
              </label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('alertCenter.actionNotesPlaceholder')}
                rows={3}
                required={actionType === 'resolve'}
                className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
          </form>
        </Modal>
      )}

      <section className="modern-alarms__table-panel">
        {isLoading ? (
          <div className="modern-alarms__loading">
            <div className="modern-alarms__loading-spinner" aria-hidden="true" />
            <span>{t('alertCenter.loading')}</span>
          </div>
        ) : (
          <div className="modern-alarms__table-wrap">
            <table className="modern-alarms__table">
              <thead>
                <tr>
                  <th className="px-6 py-4">{t('alertCenter.table.asset')}</th>
                  <th className="px-6 py-4">{t('alertCenter.table.severity')}</th>
                  <th className="px-6 py-4">{t('alertCenter.table.title')}</th>
                  <th className="px-6 py-4">{t('alertCenter.table.status')}</th>
                  <th className="px-6 py-4">{t('alertCenter.table.time')}</th>
                  <th className="px-6 py-4">{t('alertCenter.table.handler')}</th>
                  {canAcknowledge && (
                    <th className="px-6 py-4 text-center">{t('alertCenter.table.actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {alerts.length > 0 ? (
                  alerts.map((alert) => {
                    const sev = getSev(alert.severity);
                    const severityKey = alert.severity.toUpperCase();
                    const isCritical = severityKey === 'CRITICAL' || severityKey === 'EMERGENCY';
                    const isHigh = severityKey === 'HIGH' || severityKey === 'WARNING';
                    const rowStyle = isCritical ? 'is-critical' : isHigh ? 'is-high' : '';
                    const expanded = expandedId === alert.alert_id;

                    return (
                      <tr key={alert.alert_id} className={`modern-alarms__row ${rowStyle}`}>
                        <td className="px-6 py-4">
                          <div className="modern-alarms__machine">
                            <span
                              className={`modern-alarms__machine-dot${isCritical ? ' is-critical' : isHigh ? ' is-high' : ''}`}
                            />
                            <span className="font-mono text-xs">{alert.asset_id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={sev.variant}>{sev.label}</Badge>
                        </td>
                        <td className={`modern-alarms__message${isCritical ? ' is-critical' : isHigh ? ' is-high' : ''}`}>
                          <button
                            type="button"
                            className="text-left"
                            onClick={() =>
                              setExpandedId(expanded ? null : alert.alert_id)
                            }
                          >
                            <strong className="block text-sm">{alert.title}</strong>
                            <span className="block text-xs text-text-muted">{alert.event_type}</span>
                          </button>
                          {expanded && (
                            <div className="mt-2 space-y-2">
                              {(expandedAlert?.description ?? alert.description) && (
                                <p className="text-xs text-text-secondary">
                                  {expandedAlert?.description ?? alert.description}
                                </p>
                              )}
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                                  {t('alertCenter.evidence', { defaultValue: 'Evidence' })}
                                </p>
                                {isEvidenceLoading ? (
                                  <span className="text-xs text-text-muted">
                                    {t('common.status.loading', { defaultValue: 'Loading...' })}
                                  </span>
                                ) : (
                                  <AlertEvidence evidence={expandedAlert?.evidence ?? alert.evidence} />
                                )}
                              </div>
                              <RcaPanel
                                analysis={rcaResponse?.rca}
                                isLoading={isRcaLoading}
                                isError={isRcaError}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={alert.status.toLowerCase()} size="sm" />
                        </td>
                        <td className="px-6 py-4">
                          <div className="modern-alarms__timestamp">
                            <strong>
                              <Clock className="h-3 w-3" />
                              {new Date(alert.timestamp).toLocaleTimeString(locale)}
                            </strong>
                            <span>{new Date(alert.timestamp).toLocaleDateString(locale)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {alert.acknowledged_by ? (
                            <div className="modern-alarms__handler">
                              <strong>
                                <User className="h-3.5 w-3.5" />
                                {alert.acknowledged_by}
                              </strong>
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        {canAcknowledge && (
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-2">
                              {alert.status.toLowerCase() === 'open' && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-surface-3"
                                  onClick={() => {
                                    setActionAlert(alert);
                                    setActionType('ack');
                                    setActionError('');
                                  }}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {t('alertCenter.ackButton')}
                                </button>
                              )}
                              {['open', 'acknowledged'].includes(alert.status.toLowerCase()) && (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-surface-3"
                                  onClick={() => {
                                    setActionAlert(alert);
                                    setActionType('resolve');
                                    setActionError('');
                                  }}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  {t('alertCenter.resolveButton')}
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={canAcknowledge ? 7 : 6} className="px-6 py-10 text-center text-sm text-text-muted">
                      {t('alertCenter.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
