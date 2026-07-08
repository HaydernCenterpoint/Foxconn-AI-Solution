import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { alarmsApi, type Alarm } from '../features/alarms/services/alarms.api';
import {
  CheckCircle,
  User,
  Clock,
  AlertOctagon,
  ShieldAlert,
  AlertTriangle,
  Info,
  BellOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../shared/lib/translator';
import { Modal } from '../shared/components/ui/Modal';
import { Badge } from '../shared/components/ui/Badge';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { StatCard } from '../shared/components/ui/StatCard';
import { TechPanel } from '../shared/components/ui/TechPanel';
import { usePermissions } from '../shared/hooks/usePermissions';

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
    onError: (err: any) => setActionError(err.response?.data?.error || 'Lỗi xác nhận'),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      alarmsApi.resolve(id, notes),
    onSuccess: () => {
      invalidateAllAlarmsData();
      closeAction();
    },
    onError: (err: any) => setActionError(err.response?.data?.error || 'Lỗi đóng sự cố'),
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
    CRITICAL: { label: 'Nghiêm trọng', icon: <ShieldAlert className="h-3.5 w-3.5" />, variant: 'error' },
    HIGH: { label: 'Cao', icon: <AlertTriangle className="h-3.5 w-3.5" />, variant: 'warning' },
    MEDIUM: { label: 'Trung bình', icon: <AlertOctagon className="h-3.5 w-3.5" />, variant: 'info' },
    LOW: { label: 'Thấp', icon: <Info className="h-3.5 w-3.5" />, variant: 'neutral' },
  };

  const statusConfig: Record<string, { label: string; variant: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
    ACTIVE: { label: 'Mới phát sinh', variant: 'error' },
    ACKNOWLEDGED: { label: 'Đang xử lý', variant: 'warning' },
    RESOLVED: { label: 'Đã khắc phục', variant: 'success' },
  };

  const getSev = (s: string) => severityConfig[s.toUpperCase()] ?? severityConfig.LOW;

  const active = alarms.filter(a => a.status === 'ACTIVE').length;
  const acknowledged = alarms.filter(a => a.status === 'ACKNOWLEDGED').length;
  const resolved = alarms.filter(a => a.status === 'RESOLVED').length;
  const critical = alarms.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6 text-white">
      {/* Title */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary uppercase flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            {t('alarms.title', 'Cảnh báo hệ thống')}
          </h1>
          <p className="mt-2 text-base text-text-secondary">{t('alarms.subtitle', 'Giám sát sự cố kỹ thuật từ PLC — xác nhận và khắc phục bởi kỹ sư')}</p>
        </div>
        {critical > 0 && (
          <Badge variant="error" dot className="px-3.5 py-2 text-xs font-black shadow-[0_0_12px_rgba(239,68,68,0.35)] animate-bounce">
            {critical} {t('alarms.criticalLabel', 'CRITICAL')}
          </Badge>
        )}
      </div>

      {/* Overview Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label={t('alarms.total', 'Tổng cảnh báo')} value={alarms.length} accent="info" />
        <StatCard label={t('alarms.active', 'Đang active')} value={active} accent="error" />
        <StatCard label={t('alarms.acknowledged', 'Đang xử lý')} value={acknowledged} accent="warning" />
        <StatCard label={t('alarms.resolved', 'Đã khắc phục')} value={resolved} accent="success" />
      </div>

      {/* Filters Box */}
      <TechPanel
        title={t('alarms.filtersTitle', 'Bộ lọc sự cố')}
        extraHeader={
          <span className="text-xs font-bold text-cyan-400/80">
            {alarms.length} {t('alarms.resultsLabel', 'kết quả')} · {t('alarms.refreshLabel', 'tự động cập nhật')}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-5">
          <span className="text-xs font-black uppercase tracking-wider text-text-secondary">{t('alarms.filterLabel', 'Trạng thái:')}</span>
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

      {/* Main Alarms Panel Board */}
      <div className="overflow-hidden rounded-none border border-[#14356a] bg-[#0A1129]/80 shadow-[0_4px_15px_rgba(0,0,0,0.35)] relative">
        {/* Decorative corner highlights */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-cyan-400" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-cyan-400" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-cyan-400" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-cyan-400" />
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 relative z-10">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-cyan-500/25 border-t-cyan-400" />
            <span className="text-sm font-bold text-cyan-400/80">{t('alarms.loading', 'Đang tải danh sách cảnh báo...')}</span>
          </div>
        ) : (
          <div className="overflow-x-auto relative z-10">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#14356a]/65 bg-[#070c1e]/90 text-[10px] font-black uppercase tracking-wider text-text-muted">
                  <th className="px-6 py-4">{t('alarms.table.device', 'Thiết bị')}</th>
                  <th className="px-6 py-4">{t('alarms.table.severity', 'Mức độ')}</th>
                  <th className="px-6 py-4">{t('alarms.table.message', 'Nội dung sự cố')}</th>
                  <th className="px-6 py-4">{t('alarms.table.status', 'Trạng thái')}</th>
                  <th className="px-6 py-4">{t('alarms.table.time', 'Thời gian')}</th>
                  <th className="px-6 py-4">{t('alarms.table.handler', 'Xử lý bởi')}</th>
                  {canAcknowledge && <th className="px-6 py-4 text-center">{t('alarms.table.actions', 'Thao tác')}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14356a]/30">
                {alarms.length > 0 ? alarms.map(alarm => {
                  const sev = getSev(alarm.severity);
                  // WCAG accessibility overrides: Critical alerts retain standard bright warnings
                  const isCritical = alarm.severity.toUpperCase() === 'CRITICAL';
                  const isHigh = alarm.severity.toUpperCase() === 'HIGH';
                  const rowStyle = isCritical ? 'bg-red-500/5 hover:bg-red-500/10' : (isHigh ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-[#070c1e]/40');

                  return (
                    <tr key={alarm.id} className={`transition-colors ${rowStyle}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${isCritical ? 'bg-red-500 animate-ping' : isHigh ? 'bg-amber-400' : 'bg-cyan-400'}`} />
                          <span className="text-sm font-black text-[#EEEEEE]">{tDynamic(alarm.machineName)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                      </td>
                      <td className={`px-6 py-4 max-w-xs text-sm ${isCritical ? 'text-red-300 font-bold' : isHigh ? 'text-amber-200' : 'text-text-secondary'}`}>{tDynamic(alarm.message)}</td>
                      <td className="px-6 py-4">
                        <StatusBadge status={alarm.status.toLowerCase() as any} size="sm" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5 text-xs text-text-muted">
                          <span className="flex items-center gap-1 font-bold">
                            <Clock className="h-3 w-3 text-cyan-400/80" />
                            {new Date(alarm.createdAt).toLocaleTimeString(locale)}
                          </span>
                          <span>{new Date(alarm.createdAt).toLocaleDateString(locale)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        {alarm.acknowledgedBy ? (
                          <div className="space-y-1">
                            <span className="flex items-center gap-1 font-bold text-text-secondary">
                              <User className="h-3.5 w-3.5 text-cyan-400/80" />
                              {alarm.acknowledgedBy}
                            </span>
                            {alarm.notes && (
                              <p className="truncate rounded border border-[#14356a] bg-[#070c1e]/90 px-2 py-1 text-[10px] text-text-muted">{tDynamic(alarm.notes)}</p>
                            )}
                          </div>
                        ) : (
                          <span className="italic text-text-muted">{t('alarms.unhandled', 'Chưa xác nhận')}</span>
                        )}
                      </td>
                      {canAcknowledge && (
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {alarm.status === 'ACTIVE' && (
                              <button
                                onClick={() => { setActionAlarm(alarm); setActionType('ack'); }}
                                className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-black text-red-400 transition-colors hover:bg-red-500/25 animate-pulse cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                              >
                                {t('alarms.ackButton', 'Xử lý')}
                              </button>
                            )}
                            {alarm.status !== 'RESOLVED' && (
                              <button
                                onClick={() => { setActionAlarm(alarm); setActionType('resolve'); }}
                                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-400 transition-colors hover:bg-emerald-500/25 cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.2)]"
                              >
                                {t('alarms.resolveButton', 'Đóng lỗi')}
                              </button>
                            )}
                            {alarm.status === 'RESOLVED' && (
                              <span className="flex items-center gap-1 text-xs font-black text-emerald-400">
                                <CheckCircle className="h-4 w-4" /> {t('alarms.closed', 'Đã đóng')}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={canAcknowledge ? 7 : 6} className="py-20 text-center">
                      <BellOff className="mx-auto mb-4 h-12 w-12 text-cyan-400/50" />
                      <p className="text-base font-bold text-text-secondary">{t('alarms.empty', 'Không có cảnh báo phù hợp với bộ lọc')}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default AlarmPage;
