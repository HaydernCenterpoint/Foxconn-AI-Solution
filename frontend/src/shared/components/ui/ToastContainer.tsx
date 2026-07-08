import { useUiStore } from '../../store/ui.store';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const BORDER: Record<string, string> = {
  success: 'border-l-running',
  error:   'border-l-error',
  info:    'border-l-accent',
  warn:    'border-l-warn',
};

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore();
  const { t: translate } = useTranslation();

  return (
    <div className="fixed bottom-6 right-6 z-[3000] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter pointer-events-auto flex min-w-[260px] items-center gap-3 rounded-[var(--radius-large)] border border-border border-l-4 bg-panel px-4 py-3 text-sm shadow-soft ${BORDER[toast.type]}`}
        >
          {toast.type === 'success' && <CheckCircle2 size={17} className="text-running" />}
          {toast.type === 'error' && <XCircle size={17} className="text-error" />}
          {toast.type === 'info' && <Info size={17} className="text-accent" />}
          {toast.type === 'warn' && <AlertTriangle size={17} className="text-warn" />}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="text-muted transition-colors hover:text-light"
            aria-label={translate('common.aria.close')}
            title={translate('common.aria.close')}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
