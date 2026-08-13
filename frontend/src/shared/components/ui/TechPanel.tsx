import React from 'react';

type TechPanelSeverity = 'error' | 'warning' | 'info' | 'normal';

interface TechPanelProps {
  children: React.ReactNode;
  className?: string;
  alertSeverity?: TechPanelSeverity;
  title?: string;
  extraHeader?: React.ReactNode;
}

function severityClass(alertSeverity: TechPanelSeverity): string {
  switch (alertSeverity) {
    case 'error':
      return 'ui-tech-panel--error';
    case 'warning':
      return 'ui-tech-panel--warning';
    case 'info':
      return 'ui-tech-panel--info';
    case 'normal':
      return 'ui-tech-panel--normal';
    default: {
      const _exhaustive: never = alertSeverity;
      return _exhaustive;
    }
  }
}

export function TechPanel({
  children,
  className = '',
  alertSeverity = 'normal',
  title,
  extraHeader,
}: TechPanelProps) {
  return (
    <section className={`ui-tech-panel ${severityClass(alertSeverity)} ${className}`.trim()}>
      {title ? (
        <header className="ui-tech-panel__header">
          <h3 className="ui-tech-panel__title">
            <span className="ui-tech-panel__status-dot" aria-hidden="true" />
            {title}
          </h3>
          {extraHeader ? <div className="ui-tech-panel__extra">{extraHeader}</div> : null}
        </header>
      ) : null}
      <div className="ui-tech-panel__body">{children}</div>
    </section>
  );
}
