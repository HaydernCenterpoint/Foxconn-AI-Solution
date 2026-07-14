import type { ReactNode } from 'react';
import { Surface } from '../../../shared/components/ui/Surface';

interface DashboardPanelProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function DashboardPanel({
  title,
  description,
  icon,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: DashboardPanelProps) {
  return (
    <Surface variant="raised" padding="none" className={`dashboard-panel ${className}`.trim()}>
      <header className="dashboard-panel__header">
        <div className="dashboard-panel__heading">
          {icon && <span className="dashboard-panel__icon" aria-hidden="true">{icon}</span>}
          <div>
            <h2 className="dashboard-panel__title">{title}</h2>
            {description && <p className="dashboard-panel__description">{description}</p>}
          </div>
        </div>
        {actions && <div className="dashboard-panel__actions">{actions}</div>}
      </header>
      <div className={`dashboard-panel__body ${bodyClassName}`.trim()}>{children}</div>
    </Surface>
  );
}
