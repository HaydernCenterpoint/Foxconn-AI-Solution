import type { CSSProperties, ReactNode } from 'react';

interface TechPanelProps {
  children: ReactNode;
  className?: string;
  alertSeverity?: 'error' | 'warning' | 'info' | 'normal';
  title?: string;
  extraHeader?: ReactNode;
}

const SEVERITY_STYLES = {
  normal: {
    background: 'var(--color-surface)',
    border: 'var(--color-outline)',
    accent: 'var(--color-on-surface-variant)',
  },
  info: {
    background: 'var(--color-surface)',
    border: 'var(--color-information)',
    accent: 'var(--color-information)',
  },
  warning: {
    background: 'var(--color-warn-container)',
    border: 'var(--color-warn)',
    accent: 'var(--color-warn)',
  },
  error: {
    background: 'var(--color-error-container)',
    border: 'var(--color-error)',
    accent: 'var(--color-error)',
  },
} as const;

export function TechPanel({
  children,
  className = '',
  alertSeverity = 'normal',
  title,
  extraHeader,
}: TechPanelProps) {
  const severity = SEVERITY_STYLES[alertSeverity];
  const style = {
    '--tech-panel-background': severity.background,
    '--tech-panel-border': severity.border,
    '--tech-panel-accent': severity.accent,
  } as CSSProperties;

  return (
    <section className={`ui-tech-panel ui-tech-panel--${alertSeverity} ${className}`.trim()} style={style}>
      {(title || extraHeader) && (
        <header className="ui-tech-panel__header">
          {title ? (
            <h3 className="ui-tech-panel__title">
              {alertSeverity !== 'normal' && <span className="ui-tech-panel__status-dot" aria-hidden="true" />}
              {title}
            </h3>
          ) : <span />}
          {extraHeader && <div className="ui-tech-panel__extra">{extraHeader}</div>}
        </header>
      )}
      <div className="ui-tech-panel__body">{children}</div>
    </section>
  );
}
