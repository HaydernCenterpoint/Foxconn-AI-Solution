import { useState } from 'react';
import { MaterialSymbol } from '../shared/components/ui/MaterialSymbol';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getSimulationConfigs, resetSimulation, toggleSimulation } from '../features/simulation/services/simulation.api';
import type { SimulationConfig } from '../shared/types/machine';
import { Badge } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { ConfirmDialog } from '../shared/components/ui/ConfirmDialog';
import { DataState } from '../shared/components/ui/DataState';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { Surface } from '../shared/components/ui/Surface';
import { useUiStore } from '../shared/store/ui.store';

function asSimulationConfigs(data: Record<string, unknown>[] | undefined): SimulationConfig[] {
  return (data ?? []) as unknown as SimulationConfig[];
}

function formatDate(value: string | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

export const SimulationPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);
  const [resetTarget, setResetTarget] = useState<SimulationConfig | null>(null);

  const locale = i18n.language === 'zh' || i18n.language === 'zh-CN'
    ? 'zh-CN'
    : i18n.language === 'en'
      ? 'en-US'
      : 'vi-VN';

  const configsQuery = useQuery({
    queryKey: ['simulationConfigs'],
    queryFn: getSimulationConfigs,
    refetchInterval: 2_000,
  });
  const configs = asSimulationConfigs(configsQuery.data);

  const invalidateConfigs = async () => {
    await queryClient.invalidateQueries({ queryKey: ['simulationConfigs'] });
    await queryClient.invalidateQueries({ queryKey: ['simulation-all-telemetry'] });
  };

  const toggleMutation = useMutation({
    mutationFn: (machineId: string) => toggleSimulation(machineId),
    onSuccess: async () => {
      await invalidateConfigs();
      addToast('success', t('simulation.toggleSuccess', { defaultValue: 'Simulation state updated' }));
    },
    onError: () => {
      addToast('error', t('simulation.toggleError', { defaultValue: 'Unable to update simulation state' }));
    },
  });

  const resetMutation = useMutation({
    mutationFn: (machineId: string) => resetSimulation(machineId),
    onSuccess: async () => {
      await invalidateConfigs();
      addToast('success', t('simulation.resetSuccess', { defaultValue: 'Simulation reset request completed' }));
      setResetTarget(null);
    },
    onError: () => {
      addToast('error', t('simulation.resetError', { defaultValue: 'Unable to reset the simulation' }));
    },
  });

  const pageHeader = (
    <PageHeader
      eyebrow={t('simulation.eyebrow', { defaultValue: 'Test data controls' })}
      title={t('simulation.title', { defaultValue: 'Simulation' })}
      description={t('simulation.subtitle', { defaultValue: 'Start, stop, or reset backend simulation configurations. Values below are configured ranges, not live production telemetry.' })}
    />
  );

  let content: React.ReactNode;
  if (configsQuery.isLoading) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="loading"
          title={t('simulation.loading', { defaultValue: 'Loading simulation configurations' })}
          description={t('simulation.loadingDescription', { defaultValue: 'Retrieving configured simulation controls from the service.' })}
        />
      </Surface>
    );
  } else if (configsQuery.isError) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="error"
          title={t('simulation.errorTitle', { defaultValue: 'Simulation configurations are unavailable' })}
          description={t('simulation.errorDescription', { defaultValue: 'The simulation service could not be reached.' })}
          action={<Button variant="secondary" size="sm" onClick={() => void configsQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
        />
      </Surface>
    );
  } else if (configs.length === 0) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="empty"
          title={t('simulation.emptyTitle', { defaultValue: 'No simulation configurations found' })}
          description={t('simulation.emptyDescription', { defaultValue: 'The simulation service did not return configured machines.' })}
        />
      </Surface>
    );
  } else {
    content = (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {configs.map((config) => {
          const isToggling = toggleMutation.isPending && toggleMutation.variables === config.machineId;
          const isResetting = resetMutation.isPending && resetMutation.variables === config.machineId;
          return (
            <Surface key={config.machineId} variant="raised" padding="lg" className="flex min-w-0 flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate title-small text-text-primary">{config.machineName || config.machineId}</h2>
                  <p className="mt-1 font-mono text-xs text-text-muted">{config.machineIp || '—'}</p>
                </div>
                <Badge variant={config.enabled ? 'success' : 'neutral'} size="sm" dot>
                  {config.enabled
                    ? t('simulation.enabled', { defaultValue: 'Enabled' })
                    : t('simulation.disabled', { defaultValue: 'Stopped' })}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                <div>
                  <dt className="text-xs text-text-muted">{t('simulation.temperatureRange', { defaultValue: 'Temperature range' })}</dt>
                  <dd className="mt-1 font-mono text-text-primary">{config.temperatureMin}–{config.temperatureMax} {t('simulation.temperatureUnit')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t('simulation.pressureRange', { defaultValue: 'Pressure range' })}</dt>
                  <dd className="mt-1 font-mono text-text-primary">{config.pressureMin}–{config.pressureMax} {t('simulation.pressureUnit')}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t('simulation.speedRange', { defaultValue: 'Speed range' })}</dt>
                  <dd className="mt-1 font-mono text-text-primary">{config.speedMin}–{config.speedMax}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-muted">{t('simulation.errorProbability', { defaultValue: 'Error probability' })}</dt>
                  <dd className="mt-1 font-mono text-text-primary">{Number.isFinite(config.errorProbability) ? `${(config.errorProbability * 100).toFixed(0)}%` : '—'}</dd>
                </div>
              </dl>

              <div className="text-xs text-text-muted">
                {t('simulation.updatedAt', { defaultValue: 'Configuration updated' })}: {formatDate(config.updatedAt, locale)}
              </div>

              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  loading={isToggling}
                  startIcon={config.enabled ? <MaterialSymbol name="stop" size={14} /> : <MaterialSymbol name="play_arrow" size={14} />}
                  onClick={() => toggleMutation.mutate(config.machineId)}
                >
                  {config.enabled
                    ? t('simulation.stop', { defaultValue: 'Stop simulation' })
                    : t('simulation.start', { defaultValue: 'Start simulation' })}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={isToggling || isResetting}
                  startIcon={<MaterialSymbol name="undo" size={14} />}
                  onClick={() => setResetTarget(config)}
                >
                  {t('simulation.reset', { defaultValue: 'Reset' })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  startIcon={<MaterialSymbol name="open_in_new" size={14} />}
                  onClick={() => navigate(`/machines/${config.machineId}`)}
                >
                  {t('simulation.machineDetails', { defaultValue: 'Machine details' })}
                </Button>
              </div>
            </Surface>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pageHeader}
      {content}
      <ConfirmDialog
        open={Boolean(resetTarget)}
        title={t('simulation.resetConfirmTitle', { defaultValue: 'Reset simulation state?' })}
        description={t('simulation.resetConfirmDescription', {
          defaultValue: 'Send a reset request for {{name}}. This action cannot be undone from this page.',
          name: resetTarget?.machineName || resetTarget?.machineId || '',
        })}
        confirmLabel={t('simulation.reset', { defaultValue: 'Reset' })}
        confirmTone="danger"
        isPending={resetMutation.isPending}
        onCancel={() => {
          if (!resetMutation.isPending) setResetTarget(null);
        }}
        onConfirm={() => {
          if (resetTarget) resetMutation.mutate(resetTarget.machineId);
        }}
      />
    </div>
  );
};

export default SimulationPage;
