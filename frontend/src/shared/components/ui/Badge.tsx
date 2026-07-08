import type { ReactNode } from 'react';

type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'running' | 'idle' | 'offline' | 'disconnected' | 'warn';

const VARIANT_STYLES: Record<BadgeVariant, { bg: string; color: string }> = {
  primary: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
  success: { bg: 'var(--color-success-container)', color: 'var(--color-success)' },
  warning: { bg: 'var(--color-warn-container)', color: 'var(--color-warn)' },
  warn: { bg: 'var(--color-warn-container)', color: 'var(--color-warn)' },
  error: { bg: 'var(--color-error-container)', color: 'var(--color-error)' },
  info: { bg: 'var(--color-info-container)', color: 'var(--color-info)' },
  neutral: { bg: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' },
  running: { bg: 'var(--color-running-container)', color: 'var(--color-running)' },
  idle: { bg: 'var(--color-idle-container)', color: 'var(--color-idle)' },
  offline: { bg: 'var(--color-offline-container)', color: 'var(--color-offline)' },
  disconnected: { bg: 'var(--color-offline-container)', color: 'var(--color-offline)' },
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  className?: string;
}

export function Badge({ variant = 'primary', children, size = 'md', dot, className = '' }: BadgeProps) {
  const style = VARIANT_STYLES[variant];

  const sizeClasses = size === 'sm' ? 'text-[10px] px-2.5 py-0.5' : size === 'lg' ? 'text-sm px-4 py-1.5' : 'text-xs px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-medium ${sizeClasses} ${className}`} style={{ backgroundColor: style.bg, color: style.color }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: style.color }} />}
      {children}
    </span>
  );
}
