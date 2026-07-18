import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '../../store/ui.store';

const BORDER: Record<string, string> = {
  success: 'success',
  error: 'error',
  info: 'info',
  warn: 'warn',
};

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore();
  const { t } = useTranslation();

  return (
    <div className="ui-toast-container" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div key={toast.id} className={`ui-toast ui-toast--${BORDER[toast.type] ?? 'info'} toast-enter`} role="status">
          {toast.type === 'success' && <CheckCircle2 size={18} className="ui-toast__icon ui-toast__icon--success" aria-hidden="true" />}
          {toast.type === 'error' && <XCircle size={18} className="ui-toast__icon ui-toast__icon--error" aria-hidden="true" />}
          {toast.type === 'info' && <Info size={18} className="ui-toast__icon ui-toast__icon--info" aria-hidden="true" />}
          {toast.type === 'warn' && <AlertTriangle size={18} className="ui-toast__icon ui-toast__icon--warn" aria-hidden="true" />}
          <span className="ui-toast__message">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="ui-toast__close"
            aria-label={t('common.aria.close')}
            title={t('common.aria.close')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
