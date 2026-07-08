interface Props {
  value: number; // 0-100
  color?: 'accent' | 'warn' | 'error' | 'running';
  height?: string;
  showLabel?: boolean;
}

const BAR_COLORS: Record<string, string> = {
  accent:  'bg-accent',
  warn:    'bg-warn',
  error:   'bg-error',
  running: 'bg-running',
};

export function ProgressBar({ value, color = 'accent', height = 'h-1.5', showLabel = false }: Props) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = value > 85 ? 'bg-error' : value > 65 ? 'bg-warn' : BAR_COLORS[color];

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 overflow-hidden rounded-full bg-panel-soft ${height}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && <span className="text-[11px] text-muted w-8 text-right">{pct}%</span>}
    </div>
  );
}
