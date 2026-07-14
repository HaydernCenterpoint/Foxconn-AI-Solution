import { ChevronDown, ChevronUp, LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  className?: string;
  expandable?: boolean;
  defaultExpanded?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  className = '',
  expandable = false,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { t } = useTranslation();
  const canExpand = expandable && Boolean(description);

  return (
    <section className={`ui-empty-state ${className}`.trim()}>
      {icon && <div className="ui-empty-state__icon">{icon}</div>}
      <h2 className="ui-empty-state__title">{title}</h2>
      {canExpand ? (
        <>
          <button
            type="button"
            className="ui-empty-state__toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            <span>{expanded ? t('common.actions.collapse') : t('common.actions.expand')}</span>
            {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
          {expanded && <p className="ui-empty-state__description">{description}</p>}
        </>
      ) : (
        description && <p className="ui-empty-state__description">{description}</p>
      )}
    </section>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <span className={`ui-spinner ${className}`.trim()} role="status" aria-label={t('common.status.loading')}>
      <span className="ui-spinner__track" aria-hidden="true">
        <span className="ui-spinner__fill" />
      </span>
    </span>
  );
}

export function LoadingState() {
  const { t } = useTranslation();

  return (
    <section className="ui-loading-state" role="status" aria-live="polite">
      <LoaderCircle className="ui-loading-state__icon animate-spin" aria-hidden="true" />
      <span>{t('common.status.loading')}</span>
    </section>
  );
}
