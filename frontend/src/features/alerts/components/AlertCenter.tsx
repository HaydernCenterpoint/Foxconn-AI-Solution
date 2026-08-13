import { useMemo, useState } from 'react';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '../../../app/queryKeys';
import { alertsApi, type Alert, type AlertDetail as AlertDetailType, type AlertFilters as AlertFiltersType } from '../services/alerts.api';
import { AlertFilters } from './AlertFilters';
import { AlertDetail } from './AlertDetail';
import { DataState } from '../../../shared/components/ui/DataState';
import { Surface } from '../../../shared/components/ui/Surface';
import { StatCard } from '../../../shared/components/ui/StatCard';
import { Badge, type BadgeVariant } from '../../../shared/components/ui/Badge';

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const SEVERITY_ACCENT: Record<string, 'error' | 'warning' | 'info' | 'neutral'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'neutral',
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  critical: <MaterialSymbol name="gpp_maybe" size={18} />,
  high: <MaterialSymbol name="warning" size={18} />,
  medium: <MaterialSymbol name="report" size={18} />,
  low: <MaterialSymbol name="info" size={18} />,
};

function formatTimestamp(iso: string, locale: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale)}`;
}

export function AlertCenter() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language === 'en' ? 'en-US' : i18n.language === 'zh-CN' || i18n.language === 'zh' ? 'zh-CN' : 'vi-VN';

  const [filters, setFilters] = useState<AlertFiltersType>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<AlertDetailType | null>(null);

  // ── Queries ──────────────────────────────────────────────
  const {
    data: alertsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: [...queryKeys.alerts.all, filters],
    queryFn: () => alertsApi.getAll(filters),
    refetchInterval: 15_000,
  });

  const { data: stats } = useQuery({
    queryKey: queryKeys.alerts.stats(),
    queryFn: () => alertsApi.getStats(),
    refetchInterval: 30_000,
  });

  // ── Mutations ────────────────────────────────────────────
  const invalidateAlerts = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.alerts.stats() });
  };

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => {
      invalidateAlerts();
      setSelectedAlert(null);
    },
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      alertsApi.resolve(id, notes),
    onSuccess: () => {
      invalidateAlerts();
      setSelectedAlert(null);
    },
  });

  // ── Derived data ─────────────────────────────────────────
  const filteredAlerts = useMemo(() => {
    const alerts = alertsData?.alerts ?? [];
    if (!searchQuery.trim()) return alerts;
    const q = searchQuery.toLowerCase();
    return alerts.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.alertId.toLowerCase().includes(q) ||
        a.assetId.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q),
    );
  }, [alertsData, searchQuery]);

  const openCounts = stats?.openCounts ?? {};

  // ── Handlers ─────────────────────────────────────────────
  const handleSelectAlert = async (alert: Alert) => {
    const detail = await alertsApi.getById(alert.alertId);
    setSelectedAlert(detail);
  };

  const handleAcknowledge = (id: string) => acknowledgeMutation.mutate(id);

  const handleResolve = (id: string, notes?: string) =>
    resolveMutation.mutate({ id, notes });

  // ── Loading / Error states ───────────────────────────────
  if (isLoading) {
    return (
      <DataState kind="loading" title={t('alerts.loading')} />
    );
  }

  if (isError) {
    return (
      <DataState kind="error" title={t('alerts.error')} description={t('alerts.errorDescription')} />
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
          <StatCard
            key={severity}
            label={t(`alerts.severity.${severity}`)}
            value={openCounts[severity] ?? 0}
            accent={SEVERITY_ACCENT[severity]}
            icon={SEVERITY_ICONS[severity]}
          />
        ))}
      </div>

      {/* Filters */}
      <Surface variant="outlined" padding="md">
        <AlertFilters
          filters={filters}
          onChange={setFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </Surface>

      {/* Alerts table */}
      <Surface variant="default" padding="none">
        {filteredAlerts.length === 0 ? (
          <DataState kind="empty" title={t('alerts.empty')} description={t('alerts.emptyDescription')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-text-muted">
                  <th className="px-6 py-4">{t('alerts.table.title')}</th>
                  <th className="px-6 py-4">{t('alerts.table.severity')}</th>
                  <th className="px-6 py-4">{t('alerts.table.status')}</th>
                  <th className="px-6 py-4">{t('alerts.table.asset')}</th>
                  <th className="px-6 py-4">{t('alerts.table.openedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr
                    key={alert.alertId}
                    onClick={() => handleSelectAlert(alert)}
                    className="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-6 py-4 font-medium text-text-primary">{alert.title}</td>
                    <td className="px-6 py-4">
                      <Badge variant={SEVERITY_VARIANT[alert.severity.toLowerCase()] ?? 'neutral'} size="sm">
                        {alert.severity}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          alert.status.toLowerCase() === 'open'
                            ? 'error'
                            : alert.status.toLowerCase() === 'acknowledged'
                              ? 'warning'
                              : alert.status.toLowerCase() === 'resolved'
                                ? 'success'
                                : 'neutral'
                        }
                        size="sm"
                        dot
                      >
                        {alert.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-text-secondary">{alert.assetId}</td>
                    <td className="px-6 py-4 text-text-secondary">
                      {formatTimestamp(alert.openedAt, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Detail slide-over */}
      <AlertDetail
        alert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onAcknowledge={handleAcknowledge}
        onResolve={handleResolve}
      />
    </div>
  );
}
