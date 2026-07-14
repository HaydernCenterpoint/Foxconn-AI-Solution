import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, className = '' }: PageHeaderProps) {
  return (
    <div className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header__content">
        {eyebrow && <div className="ui-page-header__eyebrow">{eyebrow}</div>}
        <h1 className="ui-page-header__title">{title}</h1>
        {description && <p className="ui-page-header__description">{description}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}
