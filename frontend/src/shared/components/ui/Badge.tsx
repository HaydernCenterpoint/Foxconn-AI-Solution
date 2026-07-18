import type { CSSProperties, ReactNode } from 'react';

export type BadgeVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'warn'
  | 'error'
  | 'info'
  | 'information'
  | 'neutral'
  | 'running'
  | 'idle'
  | 'offline'
  | 'disconnected'
  | 'maintenance';

const VARIANT_STYLES: Record<BadgeVariant, { backgroundColor: string; color: string }> = {
  primary: { backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  success: { backgroundColor: 'var(--color-success-container)', color: 'var(--color-success)' },
  warning: { backgroundColor: 'var(--color-warn-container)', color: 'var(--color-warn)' },
  warn: { backgroundColor: 'var(--color-warn-container)', color: 'var(--color-warn)' },
  error: { backgroundColor: 'var(--color-error-container)', color: 'var(--color-error)' },
  info: { backgroundColor: 'var(--color-information-container)', color: 'var(--color-information)' },
  information: { backgroundColor: 'var(--color-information-container)', color: 'var(--color-information)' },
  neutral: { backgroundColor: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' },
  running: { backgroundColor: 'var(--color-running-container)', color: 'var(--color-running)' },
  idle: { backgroundColor: 'var(--color-idle-container)', color: 'var(--color-idle)' },
  offline: { backgroundColor: 'var(--color-offline-container)', color: 'var(--color-offline)' },
  disconnected: { backgroundColor: 'var(--color-offline-container)', color: 'var(--color-offline)' },
  maintenance: { backgroundColor: 'var(--color-maintenance-container)', color: 'var(--color-maintenance)' },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

export function Badge({ variant = 'primary', children, size = 'md', dot = false, className = '' }: BadgeProps) {
  const style = VARIANT_STYLES[variant];
  const badgeStyle: CSSProperties = {
    backgroundColor: style.backgroundColor,
    color: style.color,
    borderColor: 'var(--color-outline)',
  };

  return (
    <span className={`ui-badge ui-badge--${size} ${className}`.trim()} style={badgeStyle}>
      {dot && <span className="ui-badge__dot" style={{ backgroundColor: style.color }} aria-hidden="true" />}
      {children}
    </span>
  );
}
