import { useState } from 'react';
import { MaterialSymbol } from '../shared/components/ui/MaterialSymbol';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alarmsApi, type Alarm } from '../features/alarms/services/alarms.api';

import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../shared/lib/translator';
import { Modal } from '../shared/components/ui/Modal';
import { Badge } from '../shared/components/ui/Badge';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { StatCard } from '../shared/components/ui/StatCard';
import { TechPanel } from '../shared/components/ui/TechPanel';
import { usePermissions } from '../shared/hooks/usePermissions';
import './modern-alarms.css';

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback;

  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return typeof response?.data?.error === 'string' ? response.data.error : fallback;
}

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

  const { data: alarms = [], isLoading } = useQuery({
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
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      alarmsApi.acknowledge(id, notes),
    onSuccess: () => {
      invalidateAllAlarmsData();
      closeAction();
    },
    onError: (error) => setActionError(getActionErrorMessage(error, 'Lỗi xác nhận')),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      alarmsApi.resolve(id, notes),
    onSuccess: () => {
      invalidateAllAlarmsData();
      closeAction();
    },
    onError: (error) => setActionError(getActionErrorMessage(error, 'Lỗi đóng sự cố')),
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

  const severityConfig: Record<string, { label: string; icon: React.ReactNode; variant: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
    CRITICAL: { label: 'Nghiêm trọng', icon: <MaterialSymbol name="gpp_maybe" className="h-3.5 w-3.5" />, variant: 'error' },
    HIGH: { label: 'Cao', icon: <MaterialSymbol name="warning" className="h-3.5 w-3.5" />, variant: 'warning' },
    MEDIUM: { label: 'Trung bình', icon: <MaterialSymbol name="report" className="h-3.5 w-3.5" />, variant: 'info' },
    LOW: { label: 'Thấp', icon: <MaterialSymbol name="info" className="h-3.5 w-3.5" />, variant: 'neutral' },
  };

  const getSev = (s: string) => severityConfig[s.toUpperCase()] ?? severityConfig.LOW;

  const active = alarms.filter(a => a.status === 'ACTIVE').length;
  const acknowledged = alarms.filter(a => a.status === 'ACKNOWLEDGED').length;
  const resolved = alarms.filter(a => a.status === 'RESOLVED').length;
  const critical = alarms.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="modern-alarms space-y-6">
      {/* Title */}
      <header className="modern-alarms__header">
        <div>
          <p className="modern-alarms__eyebrow">{t('common.mode.readOnly')}</p>
          <h1 className="modern-alarms__title">
            <span className="modern-alarms__title-mark" aria-hidden="true" />
            {t('alarms.title', 'Cảnh báo hệ thống')}
          </h1>
          <p className="modern-alarms__subtitle">{t('alarms.subtitle', 'Giám sát sự cố kỹ thuật từ PLC — xác nhận và khắc phục bởi kỹ sư')}</p>
        </div>
        {critical > 0 && (
          <Badge variant="error" dot className="modern-alarms__critical px-3.5 py-2 text-xs font-bold">
            {critical} {t('alarms.criticalLabel', 'CRITICAL')}
          </Badge>
        )}
      </header>

      {/* Overview Stat Cards Grid */}
      <div className="modern-alarms__stat-grid">
        <StatCard label={t('alarms.total', 'Tổng cảnh báo')} value={alarms.length} accent="neutral" />
        <StatCard label={t('alarms.active', 'Đang active')} value={active} accent="error" />
        <StatCard label={t('alarms.acknowledged', 'Đang xử lý')} value={acknowledged} accent="warning" />
        <StatCard label={t('alarms.resolved', 'Đã khắc phục')} value={resolved} accent="success" />
      </div>

      {/* Filters Box */}
      <TechPanel
        title={t('alarms.filtersTitle', 'Bộ lọc sự cố')}
        extraHeader={
          <span className="modern-alarms__result-count">
            {alarms.length} {t('alarms.resultsLabel', 'kết quả')} · {t('alarms.refreshLabel', 'tự động cập nhật')}
          </span>
        }
      >
        <div className="modern-alarms__filter-row">
          <span className="modern-alarms__filter-label">{t('alarms.filterLabel', 'Trạng thái:')}</span>
          <Dropdown
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: '', label: t('alarms.filterAllStatus', 'Tất cả trạng thái') },
              { value: 'ACTIVE', label: t('alarms.statusActive', 'Mới phát sinh') },
              { value: 'ACKNOWLEDGED', label: t('alarms.statusAck', 'Đang xử lý') },
              { value: 'RESOLVED', label: t('alarms.statusResolved', 'Đã khắc phục') },
            ]}
          />
          <Dropdown
            value={severityFilter}
            onChange={setSeverityFilter}
            options={[
              { value: '', label: t('alarms.filterAllSeverity', 'Tất cả mức độ') },
              { value: 'CRITICAL', label: t('alarms.severityCritical', 'Nghiêm trọng') },
              { value: 'HIGH', label: t('alarms.severityHigh', 'Cao') },
              { value: 'MEDIUM', label: t('alarms.severityMedium', 'Trung bình') },
              { value: 'LOW', label: t('alarms.severityLow', 'Thấp') },
            ]}
          />
        </div>
      </TechPanel>

      {/* Alarms Dialog/Modal Action */}
      {canAcknowledge && (
        <Modal
          open={!!actionAlarm && !!actionType}
          onClose={closeAction}
          title={actionType === 'ack' ? t('alarms.actionAckTitle', '⚙️ Xác nhận xử lý') : t('alarms.actionResolveTitle', '✅ Đóng sự cố')}
          size="md"
          footer={
            <>
              <button type="button" onClick={closeAction} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-3">
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                form="alarm-action-form"
                disabled={ackMutation.isPending || resolveMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {actionType === 'ack' ? t('alarms.ackButton', 'Xác nhận') : t('alarms.resolveButton', 'Đóng sự cố')}
              </button>
            </>
          }
        >
          <form id="alarm-action-form" onSubmit={handleSubmit} className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs">
              <p className="font-semibold text-text-primary">{t('alarms.actionDevice', 'Thiết bị')}: <span className="text-text-primary">{actionAlarm ? tDynamic(actionAlarm.machineName) : ''}</span></p>
              <p className="text-text-muted">{t('alarms.actionIssue', 'Sự cố')}: {actionAlarm ? tDynamic(actionAlarm.message) : ''}</p>
            </div>
            {actionError && (
              <div className="rounded-lg border border-error bg-error-container px-3 py-2 text-xs text-error">{actionError}</div>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">{t('alarms.actionNotes', 'Ghi chú kỹ thuật')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('alarms.actionNotesPlaceholder', 'Nhập phương án xử lý, nguyên nhân lỗi...')}
                rows={3}
                required
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none focus:border-primary resize-none"
              />
            </div>
          </form>
        </Modal>
      )}

      <section className="modern-alarms__table-panel">
        {isLoading ? (
          <div className="modern-alarms__loading">
            <div className="modern-alarms__loading-spinner" aria-hidden="true" />
            <span>{t('alarms.loading', 'Đang tải danh sách cảnh báo...')}</span>
          </div>
        ) : (
          <div className="modern-alarms__table-wrap">
            <table className="modern-alarms__table">
              <thead>
                <tr>
                  <th className="px-6 py-4">{t('alarms.table.device', 'Thiết bị')}</th>
                  <th className="px-6 py-4">{t('alarms.table.severity', 'Mức độ')}</th>
                  <th className="px-6 py-4">{t('alarms.table.message', 'Nội dung sự cố')}</th>
                  <th className="px-6 py-4">{t('alarms.table.status', 'Trạng thái')}</th>
                  <th className="px-6 py-4">{t('alarms.table.time', 'Thời gian')}</th>
                  <th className="px-6 py-4">{t('alarms.table.handler', 'Xử lý bởi')}</th>
                  {canAcknowledge && <th className="px-6 py-4 text-center">{t('alarms.table.actions', 'Thao tác')}</th>}
                </tr>
              </thead>
              <tbody>
                {alarms.length > 0 ? alarms.map(alarm => {
                  const sev = getSev(alarm.severity);
                  // WCAG accessibility overrides: Critical alerts retain standard bright warnings
                  const isCritical = alarm.severity.toUpperCase() === 'CRITICAL';
                  const isHigh = alarm.severity.toUpperCase() === 'HIGH';
                  const rowStyle = isCritical ? 'is-critical' : (isHigh ? 'is-high' : '');

                  return (
                    <tr key={alarm.id} className={`modern-alarms__row ${rowStyle}`}>
                      <td className="px-6 py-4">
                        <div className="modern-alarms__machine">
                          <span className={`modern-alarms__machine-dot${isCritical ? ' is-critical' : isHigh ? ' is-high' : ''}`} />
                          <span>{tDynamic(alarm.machineName)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                      </td>
                      <td className={`modern-alarms__message${isCritical ? ' is-critical' : isHigh ? ' is-high' : ''}`}>{tDynamic(alarm.message)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={alarm.status.toLowerCase()} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="modern-alarms__timestamp">
                          <strong>
                            <MaterialSymbol name="schedule" className="h-3 w-3" />
                            {new Date(alarm.createdAt).toLocaleTimeString(locale)}
                          </strong>
                          <span>{new Date(alarm.createdAt).toLocaleDateString(locale)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {alarm.acknowledgedBy ? (
                          <div className="modern-alarms__handler">
                            <strong>
                              <MaterialSymbol name="person" className="h-3.5 w-3.5" />
                              {alarm.acknowledgedBy}
                            </strong>
                            {alarm.notes && (
                              <p className="modern-alarms__note">{tDynamic(alarm.notes)}</p>
                            )}
                          </div>
                        ) : (
                          <span className="italic text-text-muted">{t('alarms.unhandled', 'Chưa xác nhận')}</span>
                        )}
                      </td>
                      {canAcknowledge && (
                        <td className="px-6 py-4 text-center">
                          <div className="modern-alarms__actions">
                            {alarm.status === 'ACTIVE' && (
                              <button
                                onClick={() => { setActionAlarm(alarm); setActionType('ack'); }}
                                className="modern-alarms__button modern-alarms__button--ack"
                              >
                                {t('alarms.ackButton', 'Xử lý')}
                              </button>
                            )}
                            {alarm.status !== 'RESOLVED' && (
                              <button
                                onClick={() => { setActionAlarm(alarm); setActionType('resolve'); }}
                                className="modern-alarms__button modern-alarms__button--resolve"
                              >
                                {t('alarms.resolveButton', 'Đóng lỗi')}
                              </button>
                            )}
                            {alarm.status === 'RESOLVED' && (
                              <span className="modern-alarms__closed">
                                <MaterialSymbol name="check_circle" className="h-4 w-4" /> {t('alarms.closed', 'Đã đóng')}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={canAcknowledge ? 7 : 6}>
                      <div className="modern-alarms__empty">
                        <MaterialSymbol name="notifications_off" className="h-12 w-12" />
                        <p>{t('alarms.empty', 'Không có cảnh báo phù hợp với bộ lọc')}</p>
                      </div>
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
};
export default AlarmPage;
