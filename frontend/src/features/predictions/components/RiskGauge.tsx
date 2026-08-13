
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../app/queryKeys';
import { Badge } from '../../../shared/components/ui/Badge';
import type { BadgeVariant } from '../../../shared/components/ui/Badge';
import { DataState } from '../../../shared/components/ui/DataState';
import { Surface } from '../../../shared/components/ui/Surface';
import { predictionsApi } from '../services/predictions.api';

interface RiskGaugeProps {
  assetId: string;
}

const LEVEL_COLORS: Record<string, string> = {
  critical: 'var(--color-error)',
  high: 'var(--color-warn)',
  medium: 'var(--color-warn)',
  low: 'var(--color-running)',
};

const LEVEL_BADGE: Record<string, BadgeVariant> = {
  critical: 'error',
  high: 'warning',
  medium: 'warn',
  low: 'success',
};

function toPercent(value: number): number {
  return value <= 1 ? value * 100 : value;
}

function arcPath(score: number): string {
  const clamp = Math.max(0, Math.min(score, 100));
  const angle = (clamp / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 60;
  const cy = 60;
  const r = 50;
  const x = cx + r * Math.cos(Math.PI - rad);
  const y = cy - r * Math.sin(Math.PI - rad);
  const large = angle > 90 ? 1 : 0;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

export function RiskGauge({ assetId }: RiskGaugeProps) {
  const { t } = useTranslation();

  const {
    data: risk,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.predictions.risk(assetId),
    queryFn: () => predictionsApi.getRisk(assetId),
    enabled: !!assetId,
  });

  if (isLoading) {
    return (
      <Surface>
        <DataState kind="loading" title={t('common.loading')} />
      </Surface>
    );
  }

  if (isError || !risk) {
    return (
      <Surface>
        <DataState kind="error" title={t('predictions.unavailable')} />
      </Surface>
    );
  }

  const score = toPercent(risk.riskScore);
  const level = risk.riskLevel.toLowerCase();
  const color = LEVEL_COLORS[level] ?? LEVEL_COLORS.low;
  const factors = Object.entries(risk.contributingFactors).map(([name, value]) =>
    `${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
  const badgeVariant = LEVEL_BADGE[level] ?? 'neutral';

  return (
    <Surface>
      <div className="flex flex-col items-center gap-3">
        {/* Semicircle gauge */}
        <svg viewBox="0 0 120 70" className="w-32" aria-hidden="true">
          {/* Background arc */}
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            stroke="var(--color-surface-container-high)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Score arc */}
          <path
            d={arcPath(score)}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <text
            x="60"
            y="55"
            textAnchor="middle"
            className="text-lg font-bold"
            fill={color}
            style={{ fontSize: '18px' }}
          >
            {Math.round(score)}
          </text>
        </svg>

        {/* Risk level badge */}
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant} size="sm">
            <MaterialSymbol name="warning" size={12} className="mr-1 inline" />
            {t(`predictions.level.${level}`, { defaultValue: risk.riskLevel })}
          </Badge>
        </div>

        {/* Confidence */}
        <span className="text-xs text-[var(--color-on-surface-variant)]">
          {t('predictions.confidence')}: {Math.round(risk.confidence * 100)}%
        </span>

        {/* Contributing factors */}
        {factors.length > 0 && (
          <div className="w-full">
            <h4 className="mb-1 text-xs font-medium">{t('predictions.factors')}</h4>
            <ul className="flex flex-col gap-0.5 text-xs text-[var(--color-on-surface-variant)]">
              {factors.map((factor) => (
                <li key={factor} className="flex items-start gap-1">
                  <span aria-hidden="true" className="mt-1 block h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  {factor}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Surface>
  );
}
