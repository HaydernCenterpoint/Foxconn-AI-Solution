interface Props {
  value: number;
  color?: 'accent' | 'warn' | 'error' | 'running';
  height?: string;
  showLabel?: boolean;
  ariaLabel?: string;
}

const BAR_COLORS: Record<NonNullable<Props['color']>, string> = {
  accent: 'accent',
  warn: 'warn',
  error: 'error',
  running: 'running',
};

export function ProgressBar({
  value,
  color = 'accent',
  height = 'h-1.5',
  showLabel = false,
  ariaLabel,
}: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const resolvedColor = value > 85 ? 'error' : value > 65 ? 'warn' : BAR_COLORS[color];

  return (
    <div className="ui-progress">
      <div
        className={`ui-progress__track ${height}`}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`ui-progress__fill ui-progress__fill--${resolvedColor}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <span className="ui-progress__label">{pct}%</span>}
    </div>
  );
}
