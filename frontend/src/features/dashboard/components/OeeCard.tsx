import { memo } from 'react';
import { TrendingUp } from 'lucide-react';

interface Props {
  value: number;
  label: string;
}

function OeeCardComponent({ value, label }: Props) {
  const getColor = (val: number) => {
    if (val >= 85) return 'var(--color-running)';
    if (val >= 70) return 'var(--color-idle)';
    return 'var(--color-error)';
  };

  const color = getColor(value);

  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-outline-variant)',
      }}
    >
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: `${color}15` }}>
        <TrendingUp size={24} style={{ color }} />
      </div>
      <p
        className="text-3xl font-bold tabular-nums"
        style={{ color }}
      >
        {value}%
      </p>
      <p className="mt-1 text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
        {label}
      </p>
    </div>
  );
}

export const OeeCard = memo(OeeCardComponent);
