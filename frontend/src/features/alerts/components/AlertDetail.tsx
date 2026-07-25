import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle, ShieldCheck } from 'lucide-react';
import { Badge, type BadgeVariant } from '../../../shared/components/ui/Badge';
import { Button } from '../../../shared/components/ui/Button';
import type { AlertDetail as AlertDetailType } from '../services/alerts.api';

interface AlertDetailProps {
  alert: AlertDetailType | null;
  onClose: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string, notes?: string) => void;
}

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  open: 'error',
  acknowledged: 'warning',
  resolved: 'success',
  suppressed: 'neutral',
};

function formatTimestamp(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale)}`;
}

export function AlertDetail({ alert, onClose, onAcknowledge, onResolve }: AlertDetailProps) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState('');
  const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'zh-CN' || i18n.language === 'zh' ? 'zh-CN' : 'vi-VN';

  if (!alert) return null;

  const isOpen = alert.status.toLowerCase() === 'open';
  const isResolvable = alert.status.toLowerCase() !== 'resolved' && alert.status.toLowerCase() !== 'suppressed';

  const handleResolve = () => {
    onResolve(alert.alertId, notes || undefined);
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <aside className="relative z-10 flex w-full max-w-lg flex-col overflow-y-auto bg-surface-1 shadow-xl">
        {/* Header */}
        <header className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t('alerts.detail.header')}
            </p>
            <h2 className="truncate text-lg font-bold text-text-primary">{alert.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
            aria-label={t('common.actions.close')}
          >
            <X size={20} />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 space-y-6 px-6 py-5">
          {/* Status & Severity badges */}
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[alert.status.toLowerCase()] ?? 'neutral'} dot>
              {alert.status}
            </Badge>
            <Badge variant={SEVERITY_VARIANT[alert.severity.toLowerCase()] ?? 'neutral'}>
              {alert.severity}
            </Badge>
          </div>

          {/* Info fields */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
            <dt className="font-semibold text-text-muted">{t('alerts.detail.alertId')}</dt>
            <dd className="font-mono text-text-primary">{alert.alertId}</dd>

            <dt className="font-semibold text-text-muted">{t('alerts.detail.assetId')}</dt>
            <dd className="text-text-primary">{alert.assetId}</dd>

            <dt className="font-semibold text-text-muted">{t('alerts.detail.ruleId')}</dt>
            <dd className="font-mono text-text-primary">{alert.ruleId}</dd>

            <dt className="font-semibold text-text-muted">{t('alerts.detail.eventId')}</dt>
            <dd className="font-mono text-text-primary">{alert.eventId}</dd>

            <dt className="font-semibold text-text-muted">{t('alerts.detail.openedAt')}</dt>
            <dd className="text-text-primary">{formatTimestamp(alert.openedAt, locale)}</dd>

            {alert.closedAt && (
              <>
                <dt className="font-semibold text-text-muted">{t('alerts.detail.closedAt')}</dt>
                <dd className="text-text-primary">{formatTimestamp(alert.closedAt, locale)}</dd>
              </>
            )}

            {alert.acknowledgedBy && (
              <>
                <dt className="font-semibold text-text-muted">{t('alerts.detail.acknowledgedBy')}</dt>
                <dd className="text-text-primary">{alert.acknowledgedBy}</dd>
              </>
            )}

            {alert.acknowledgedAt && (
              <>
                <dt className="font-semibold text-text-muted">{t('alerts.detail.acknowledgedAt')}</dt>
                <dd className="text-text-primary">{formatTimestamp(alert.acknowledgedAt, locale)}</dd>
              </>
            )}

            {alert.resolvedBy && (
              <>
                <dt className="font-semibold text-text-muted">{t('alerts.detail.resolvedBy')}</dt>
                <dd className="text-text-primary">{alert.resolvedBy}</dd>
              </>
            )}

            {alert.resolvedAt && (
              <>
                <dt className="font-semibold text-text-muted">{t('alerts.detail.resolvedAt')}</dt>
                <dd className="text-text-primary">{formatTimestamp(alert.resolvedAt, locale)}</dd>
              </>
            )}
          </dl>

          {/* Description */}
          {alert.description && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alerts.detail.description')}
              </h3>
              <p className="text-sm text-text-primary">{alert.description}</p>
            </div>
          )}

          {/* Evidence */}
          {alert.evidence && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alerts.detail.evidence')}
              </h3>
              <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 text-xs text-text-primary">
                {alert.evidence}
              </pre>
            </div>
          )}

          {/* Resolution notes */}
          {alert.resolutionNotes && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alerts.detail.resolutionNotes')}
              </h3>
              <p className="text-sm text-text-primary">{alert.resolutionNotes}</p>
            </div>
          )}

          {/* Suppression reason */}
          {alert.suppressionReason && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alerts.detail.suppressionReason')}
              </h3>
              <p className="text-sm text-text-primary">{alert.suppressionReason}</p>
            </div>
          )}

          {/* Resolve notes textarea */}
          {isResolvable && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                {t('alerts.detail.notesLabel')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('alerts.detail.notesPlaceholder')}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary"
              />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <footer className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          {isOpen && (
            <Button
              variant="secondary"
              size="sm"
              startIcon={<ShieldCheck size={16} />}
              onClick={() => onAcknowledge(alert.alertId)}
            >
              {t('alerts.acknowledge')}
            </Button>
          )}
          {isResolvable && (
            <Button
              variant="primary"
              size="sm"
              startIcon={<CheckCircle size={16} />}
              onClick={handleResolve}
            >
              {t('alerts.resolve')}
            </Button>
          )}
        </footer>
      </aside>
    </div>
  );
}
