
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from './MaterialSymbol';
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
          {toast.type === 'success' && <MaterialSymbol name="check_circle" size={18} className="ui-toast__icon ui-toast__icon--success" />}
          {toast.type === 'error' && <MaterialSymbol name="cancel" size={18} className="ui-toast__icon ui-toast__icon--error" />}
          {toast.type === 'info' && <MaterialSymbol name="info" size={18} className="ui-toast__icon ui-toast__icon--info" />}
          {toast.type === 'warn' && <MaterialSymbol name="warning" size={18} className="ui-toast__icon ui-toast__icon--warn" />}
          <span className="ui-toast__message">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="ui-toast__close"
            aria-label={t('common.aria.close')}
            title={t('common.aria.close')}
          >
            <MaterialSymbol name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
