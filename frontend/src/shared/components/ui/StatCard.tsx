import type { CSSProperties, ReactNode } from 'react';

type Accent =
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'running'
  | 'idle'
  | 'offline'
  | 'disconnected'
  | 'warn'
  | 'accent';

const ACCENT_TEXT: Record<Accent, string> = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warn)',
  warn: 'var(--color-warn)',
  error: 'var(--color-error)',
  info: 'var(--color-information)',
  neutral: 'var(--color-on-surface-variant)',
  running: 'var(--color-running)',
  idle: 'var(--color-idle)',
  offline: 'var(--color-offline)',
  disconnected: 'var(--color-offline)',
  accent: 'var(--color-accent)',
};

const ACCENT_ICON_BG: Record<Accent, string> = {
  primary: 'var(--color-primary-light)',
  success: 'var(--color-success-container)',
  warning: 'var(--color-warn-container)',
  warn: 'var(--color-warn-container)',
  error: 'var(--color-error-container)',
  info: 'var(--color-information-container)',
  neutral: 'var(--color-surface-container-high)',
  running: 'var(--color-running-container)',
  idle: 'var(--color-idle-container)',
  offline: 'var(--color-offline-container)',
  disconnected: 'var(--color-offline-container)',
  accent: 'var(--color-accent-container)',
};

interface Props {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  accent?: Accent;
  trend?: { direction: 'up' | 'down' | 'neutral'; value: string };
  hint?: ReactNode;
  loading?: boolean;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
  hint,
  trend,
  loading = false,
  className = '',
}: Props) {
  const trendColor = trend?.direction === 'up'
    ? 'var(--color-success)'
    : trend?.direction === 'down'
      ? 'var(--color-error)'
      : 'var(--color-on-surface-variant)';
  const trendArrow = trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '';
  const style = {
    '--stat-accent': ACCENT_TEXT[accent],
    '--stat-icon-background': ACCENT_ICON_BG[accent],
  } as CSSProperties;

  return (
    <section className={`ui-stat-card ${className}`.trim()} style={style} aria-busy={loading || undefined}>
      <div className="ui-stat-card__content">
        <p className="ui-stat-card__label">{label}</p>
        {loading ? (
          <span className="ui-stat-card__skeleton" aria-label={label} />
        ) : (
          <div className="ui-stat-card__value-row">
            <p className="ui-stat-card__value">{value}</p>
            {trend && <span className="ui-stat-card__trend" style={{ color: trendColor }}>{trendArrow} {trend.value}</span>}
          </div>
        )}
        {hint && <p className="ui-stat-card__hint">{hint}</p>}
      </div>
      {icon && <div className="ui-stat-card__icon">{icon}</div>}
    </section>
  );
}
