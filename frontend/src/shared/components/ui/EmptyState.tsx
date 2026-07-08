import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';

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

  if (expandable && description) {
    return (
      <div
        className={`rounded-xl px-6 py-4 text-center ${className}`}
        style={{ backgroundColor: 'var(--color-surface-container-low)', width: '100%' }}
      >
        {icon && (
          <div
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
          >
            {icon}
          </div>
        )}
        <p className="text-sm font-medium w-full" style={{ color: 'var(--color-on-surface)' }}>{title}</p>
        <div
          className="mt-2 flex items-center justify-center gap-1 text-xs cursor-pointer select-none"
          style={{ color: 'var(--color-primary)' }}
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(!expanded); }}
        >
          {expanded ? (
            <>
              <span>{t('common.actions.collapse')}</span>
              <ChevronUp size={14} />
            </>
          ) : (
            <>
              <span>{t('common.actions.expand')}</span>
              <ChevronDown size={14} />
            </>
          )}
        </div>
        {expanded && (
          <p className="mt-2 w-full max-w-[450px] mx-auto text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
            {description}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[160px] flex-col items-center justify-center rounded-xl px-6 py-6 text-center ${className}`}
      style={{ backgroundColor: 'var(--color-surface-container-low)', width: '100%' }}
    >
      {icon && (
        <div
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
        >
          {icon}
        </div>
      )}
      <p className="text-sm font-medium w-full" style={{ color: 'var(--color-on-surface)' }}>{title}</p>
      {description && (
        <p className="mt-2 w-full max-w-[450px] mx-auto text-xs leading-relaxed" style={{ color: 'var(--color-on-surface-variant)' }}>
          {description}
        </p>
      )}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`h-1 w-24 overflow-hidden rounded-full ${className}`} style={{ backgroundColor: 'var(--color-surface-container-high)' }}>
      <div className="h-full rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
    </div>
  );
}

export function LoadingState() {
  const { t } = useTranslation();

  return (
    <div
      className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-xl py-12"
      style={{ backgroundColor: 'var(--color-surface-container-low)' }}
    >
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ backgroundColor: 'var(--color-primary)' }} />
        <div
          className="absolute inset-2 animate-pulse rounded-full"
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      </div>
      <span className="text-sm font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
        {t('common.status.loading')}
      </span>
    </div>
  );
}
