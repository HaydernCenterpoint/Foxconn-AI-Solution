import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type DataStateKind = 'loading' | 'empty' | 'error';

interface DataStateProps {
  kind: DataStateKind;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_ICONS: Record<DataStateKind, ReactNode> = {
  loading: <LoaderCircle className="animate-spin" aria-hidden="true" />,
  empty: <Inbox aria-hidden="true" />,
  error: <AlertCircle aria-hidden="true" />,
};

export function DataState({ kind, title, description, icon, action, className = '' }: DataStateProps) {
  return (
    <section
      className={`ui-data-state ui-data-state--${kind} ${className}`.trim()}
      aria-live={kind === 'loading' ? 'polite' : undefined}
    >
      <div className="ui-data-state__icon">{icon ?? DEFAULT_ICONS[kind]}</div>
      <h2 className="ui-data-state__title">{title}</h2>
      {description && <p className="ui-data-state__description">{description}</p>}
      {action && <div className="ui-data-state__action">{action}</div>}
    </section>
  );
}
