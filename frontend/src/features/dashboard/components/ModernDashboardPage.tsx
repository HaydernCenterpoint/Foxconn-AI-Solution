import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../../../app/queryKeys';
import { queryTimings } from '../../../app/queryOptions';
import { useAuthStore } from '../../../shared/store/auth.store';
import { linesApi } from '../../production-lines/services/lines.api';
import { machinesApi } from '../../machines/services/machines.api';
import { createDashboardViewModel } from '../dashboardViewModel';
import { dashboardApi } from '../services/dashboard.api';
import { isAssetId, predictiveAlertsApi, type AssetHealth } from '../services/predictiveAlerts.api';
import { ModernDashboard } from './ModernDashboard';

export type DashboardRole = 'admin' | 'engineer' | 'viewer';

export function ModernDashboardPage({ role }: { role: DashboardRole }) {
  const { t } = useTranslation();
  const username = useAuthStore((state) => state.username);
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: dashboardApi.getSummary,
    refetchInterval: queryTimings.dashboard,
  });
  const linesQuery = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });
  const machinesQuery = useQuery({
    queryKey: queryKeys.machines.list(),
    queryFn: machinesApi.getAll,
    refetchInterval: queryTimings.machines,
  });
  const predictiveAlertsQuery = useQuery({
    queryKey: queryKeys.predictiveAlerts.list(),
    queryFn: () => predictiveAlertsApi.listAlerts(),
    refetchInterval: queryTimings.dashboard,
  });
  const healthAssetIds = useMemo(
    () => [...new Set((predictiveAlertsQuery.data ?? [])
      .map((alert) => alert.asset_id)
      .filter(isAssetId))].slice(0, 3),
    [predictiveAlertsQuery.data],
  );
  const healthQueries = useQueries({
    queries: healthAssetIds.map((assetId) => ({
      queryKey: queryKeys.predictiveAlerts.health(assetId),
      queryFn: () => predictiveAlertsApi.getHealth(assetId),
      staleTime: 60_000,
    })),
  });
  const healthByAssetId = useMemo<Record<string, AssetHealth | undefined>>(
    () => healthAssetIds.reduce<Record<string, AssetHealth | undefined>>((scores, assetId, index) => {
      scores[assetId] = healthQueries[index]?.data;
      return scores;
    }, {}),
    [healthAssetIds, healthQueries],
  );

  const viewModel = useMemo(
    () => createDashboardViewModel({
      summary: summaryQuery.data,
      lines: linesQuery.data,
      machines: machinesQuery.data,
    }),
    [linesQuery.data, machinesQuery.data, summaryQuery.data],
  );

  const isLoading = summaryQuery.isLoading || linesQuery.isLoading || machinesQuery.isLoading;
  const isError = summaryQuery.isError || linesQuery.isError || machinesQuery.isError;
  const fallbackUsername = role === 'viewer' ? t('common.guest') : t('dashboardPage.modern.operator');

  return (
    <ModernDashboard
      viewModel={viewModel}
      username={username ?? fallbackUsername}
      basePath={role === 'viewer' ? '/' : '/admin'}
      isLoading={isLoading}
      isError={isError}
      predictiveAlerts={predictiveAlertsQuery.data}
      healthByAssetId={healthByAssetId}
      isPredictiveAlertsLoading={predictiveAlertsQuery.isLoading}
      isPredictiveAlertsError={predictiveAlertsQuery.isError}
    />
  );
}
