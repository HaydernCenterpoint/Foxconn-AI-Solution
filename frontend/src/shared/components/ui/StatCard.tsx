import type { ReactNode } from 'react';

type Accent = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'running' | 'idle' | 'offline' | 'disconnected' | 'warn' | 'accent';

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
  accent: 'var(--color-accent-light)',
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

export function StatCard({ label, value, icon, accent = 'primary', hint, trend, className = '' }: Props) {
  const trendColor =
    trend?.direction === 'up'
      ? 'var(--color-success)'
      : trend?.direction === 'down'
        ? 'var(--color-error)'
        : 'var(--color-on-surface-variant)';

  const trendArrow =
    trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '';

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-border bg-surface-1 p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${className}`}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: ACCENT_TEXT[accent] }} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary/85">{label}</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-3xl lg:text-[2rem] font-semibold leading-none tabular-nums transition-transform duration-200 group-hover:scale-105" style={{ color: ACCENT_TEXT[accent] }}>
              {value}
            </p>
            {trend && (
              <span className="text-sm font-medium" style={{ color: trendColor }}>
                {trendArrow} {trend.value}
              </span>
            )}
          </div>
          {hint && <p className="mt-2 text-[13px] font-medium text-text-muted/90 tracking-wide leading-normal">{hint}</p>}
        </div>
        {icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
            style={{ backgroundColor: ACCENT_ICON_BG[accent], color: ACCENT_TEXT[accent] }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
