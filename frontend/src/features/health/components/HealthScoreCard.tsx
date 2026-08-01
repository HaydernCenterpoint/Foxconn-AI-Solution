import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../app/queryKeys';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { Surface } from '../../../shared/components/ui/Surface';
import { healthApi } from '../services/health.api';
import type { HealthBreakdown, HealthBreakdownItem } from '../services/health.api';
import { HealthBadge } from './HealthBadge';

interface HealthScoreCardProps {
  assetId: string;
}

type BreakdownKey = keyof HealthBreakdown;

const BREAKDOWN_KEYS: readonly BreakdownKey[] = ['uptime', 'alarms', 'performance', 'maintenance'];

function getDisplayValue(key: BreakdownKey, item: HealthBreakdownItem): string {
  switch (key) {
    case 'uptime':
      return item.value !== undefined ? `${Math.round(item.value)}%` : '–';
    case 'alarms':
      return item.count !== undefined ? String(item.count) : '–';
    case 'performance':
      return item.ratio !== undefined ? `${Math.round(item.ratio)}%` : '–';
    case 'maintenance':
      return item.overdueDays !== undefined ? `${item.overdueDays}d` : '–';
    default:
      return '–';
  }
}

export function HealthScoreCard({ assetId }: HealthScoreCardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: health,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.health.score(assetId),
    queryFn: () => healthApi.getScore(assetId),
    enabled: !!assetId,
  });

  const computeMutation = useMutation({
    mutationFn: () => healthApi.compute(assetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.health.score(assetId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.health.history(assetId) });
    },
  });

  if (isLoading) {
    return (
      <Surface>
        <DataState kind="loading" title={t('common.loading')} />
      </Surface>
    );
  }

  if (isError || !health) {
    return (
      <Surface>
        <DataState kind="error" title={t('common.error')} />
      </Surface>
    );
  }

  return (
    <Surface>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <HealthBadge score={health.overallScore} colorCode={health.colorCode} />
          <span className="text-sm font-medium">{t('health.healthScore')}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={computeMutation.isPending}
          startIcon={<RefreshCw size={14} aria-hidden="true" />}
          onClick={() => computeMutation.mutate()}
        >
          {t('common.actions.refresh')}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {BREAKDOWN_KEYS.map((key) => {
          const item = health.breakdown[key];
          const pct = item.weight > 0 ? Math.min((item.contribution / item.weight) * 100, 100) : 0;

          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{t(`health.${key}`)}</span>
                <span className="tabular-nums">{getDisplayValue(key, item)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-container-high)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: health.colorCode || 'var(--color-primary)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Surface>
  );
}
