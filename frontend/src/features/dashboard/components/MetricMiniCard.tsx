import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  tone?: 'accent' | 'running' | 'error' | 'offline' | 'light';
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  accent: 'text-accent',
  running: 'text-running',
  error: 'text-error',
  offline: 'text-offline',
  light: 'text-light',
};

export function MetricMiniCard({ label, value, tone = 'light' }: Props) {
  return (
    <div className="metric-tile">
      <p className="eyebrow">{label}</p>
      <p className={`mt-2 text-2xl font-black leading-none ${toneClass[tone]}`}>
        {value}
      </p>
    </div>
  );
}
