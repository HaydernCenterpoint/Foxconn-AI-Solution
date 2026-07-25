interface HealthBadgeProps {
  score: number;
  colorCode: string;
  size?: 'sm' | 'md';
}

function resolveColor(score: number, colorCode: string): string {
  if (colorCode) return colorCode;
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
};

export function HealthBadge({ score, colorCode, size = 'md' }: HealthBadgeProps) {
  const color = resolveColor(score, colorCode);

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]}`}
      style={{ backgroundColor: `${color}20`, color, border: `1.5px solid ${color}` }}
      aria-label={`Health score ${Math.round(score)}`}
    >
      {Math.round(score)}
    </span>
  );
}
