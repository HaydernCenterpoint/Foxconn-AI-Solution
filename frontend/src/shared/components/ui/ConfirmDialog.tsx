import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'primary';
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmTone = 'primary',
  isPending = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const confirmClassName = confirmTone === 'danger'
    ? 'btn-danger'
    : 'btn-primary';
  const resolvedConfirmLabel = confirmLabel ?? t('common.actions.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.actions.cancel');

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="space-y-6">
        <p className="text-sm text-muted">{description}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`btn disabled:opacity-50 ${confirmClassName}`}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
