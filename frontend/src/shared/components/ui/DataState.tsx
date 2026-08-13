
import type { ReactNode } from 'react';
import { MaterialSymbol } from './MaterialSymbol';

type DataStateKind = 'loading' | 'empty' | 'error';

interface DataStateProps {
  kind: DataStateKind;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const DEFAULT_ICONS: Record<Exclude<DataStateKind, 'loading'>, ReactNode> = {
  empty: <MaterialSymbol name="inbox" />,
  error: <MaterialSymbol name="error" />,
};

export function DataState({ kind, title, description, icon, action, className = '' }: DataStateProps) {
  switch (kind) {
    case 'loading':
      return (
        <section
          className={`ui-data-state ui-data-state--loading ${className}`.trim()}
          aria-busy="true"
          aria-live="polite"
        >
          <div className="ui-data-state__skeleton" aria-hidden="true">
            <span className="skeleton ui-data-state__skeleton-bar" />
            <span className="skeleton ui-data-state__skeleton-bar ui-data-state__skeleton-bar--mid" />
            <span className="skeleton ui-data-state__skeleton-bar ui-data-state__skeleton-bar--short" />
          </div>
          <h2 className="ui-data-state__title">{title}</h2>
        </section>
      );
    case 'empty':
    case 'error':
      return (
        <section className={`ui-data-state ui-data-state--${kind} ${className}`.trim()}>
          <div className="ui-data-state__icon">{icon ?? DEFAULT_ICONS[kind]}</div>
          <h2 className="ui-data-state__title">{title}</h2>
          {description ? <p className="ui-data-state__description">{description}</p> : null}
          {action ? <div className="ui-data-state__action">{action}</div> : null}
        </section>
      );
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
