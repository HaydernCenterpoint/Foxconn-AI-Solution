interface HealthBadgeProps {
  score: number;
  colorCode: string;
  size?: 'sm' | 'md';
}

function resolveColor(score: number, colorCode: string): string {
  if (colorCode) return colorCode;
  if (score >= 80) return 'var(--color-running)';
  if (score >= 60) return 'var(--color-warn)';
  if (score >= 40) return 'var(--color-warn)';
  return 'var(--color-error)';
}

const SIZE_CLASSES: Record<'sm' | 'md', string> = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
};

export function HealthBadge({ score, colorCode, size = 'md' }: HealthBadgeProps) {
  const color = resolveColor(score, colorCode);
  const usesHex = color.startsWith('#');

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-semibold tabular-nums ${SIZE_CLASSES[size]}`}
      style={{
        backgroundColor: usesHex ? `${color}20` : undefined,
        color,
        border: `1.5px solid ${color}`,
      }}
      aria-label={`Health score ${Math.round(score)}`}
    >
      {Math.round(score)}
    </span>
  );
}
