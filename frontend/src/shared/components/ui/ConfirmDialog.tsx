import { useTranslation } from 'react-i18next';
import { Button } from './Button';
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
  const resolvedConfirmLabel = confirmLabel ?? t('common.actions.confirm');
  const resolvedCancelLabel = cancelLabel ?? t('common.actions.cancel');

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="space-y-6">
        <p className="text-sm text-text-secondary">{description}</p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>{resolvedCancelLabel}</Button>
          <Button variant={confirmTone} loading={isPending} onClick={onConfirm}>{resolvedConfirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
