import { Factory } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Machine } from '../../machines/services/machines.api';
import type { ProductionLine } from '../../production-lines/services/lines.api';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { formatNumber } from '../../../shared/lib/utils';
import { DashboardPanel } from './DashboardPanel';
import {
  getAggregateMachineStatus,
  getMachineMetric,
  getMachineStatusCounts,
} from './dashboardData';

interface LineOperationsPanelProps {
  line: ProductionLine | null;
  machines?: Machine[];
  isLoading: boolean;
  isError: boolean;
  selectedMachineId: string | null;
  onSelectMachine: (machineId: string) => void;
  onRetry?: () => void;
  translateName: (value: string) => string;
}

export function LineOperationsPanel({
  line,
  machines = [],
  isLoading,
  isError,
  selectedMachineId,
  onSelectMachine,
  onRetry,
  translateName,
}: LineOperationsPanelProps) {
  const { t } = useTranslation();

  const status = useMemo(() => getAggregateMachineStatus(machines), [machines]);
  const statusCounts = useMemo(() => getMachineStatusCounts(machines), [machines]);

  const title = line
    ? translateName(line.name)
    : t('dashboardPage.lineOperationsTitle', { defaultValue: 'Line operations' });
  const description = line?.description
    ?? t('dashboardPage.lineOperationsDescription', { defaultValue: 'Live station status for the selected production line.' });

  const renderState = () => {
    if (isLoading) {
      return (
        <DataState
          kind="loading"
          title={t('dashboardPage.loadingLine', { defaultValue: 'Loading line stations' })}
          description={t('dashboardPage.loadingLineDescription', { defaultValue: 'Retrieving the stations assigned to this production line.' })}
        />
      );
    }

    if (isError) {
      return (
        <DataState
          kind="error"
          title={t('dashboardPage.lineLoadError', { defaultValue: 'Line stations are unavailable' })}
          description={t('dashboardPage.lineLoadErrorDescription', { defaultValue: 'The selected line could not be loaded.' })}
          action={onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      );
    }

    if (!line) {
      return (
        <DataState
          kind="empty"
          title={t('dashboardPage.noLineTitle', { defaultValue: 'No production line selected' })}
          description={t('dashboardPage.noLineDescription', { defaultValue: 'Create or select a production line to view its stations.' })}
        />
      );
    }

    if (machines.length === 0) {
      return (
        <DataState
          kind="empty"
          title={t('dashboardPage.emptyLine', { defaultValue: 'No approved stations are assigned to this line' })}
          description={t('dashboardPage.emptyLineDescription', { defaultValue: 'No live station data is available for the selected production line.' })}
        />
      );
    }

    return (
      <>
        <div className="dashboard-machine-grid">
          {machines.map((machine) => {
            const output = getMachineMetric(machine, 'output');
            const oee = getMachineMetric(machine, 'oee');
            const identifier = machine.machineCode ?? machine.clientId ?? machine.id;
            const selected = selectedMachineId === machine.id;

            return (
              <button
                key={machine.id}
                type="button"
                className={`dashboard-machine-card ${selected ? 'is-selected' : ''}`.trim()}
                onClick={() => onSelectMachine(machine.id)}
                aria-pressed={selected}
              >
                <div className="dashboard-machine-card__topline">
                  <span className="dashboard-machine-card__identifier">{identifier}</span>
                  <StatusBadge status={machine.status} size="sm" />
                </div>
                <p className="dashboard-machine-card__name" title={translateName(machine.name)}>
                  {translateName(machine.name)}
                </p>
                <div className="dashboard-machine-card__metrics">
                  <div className="dashboard-machine-card__metric">
                    <span className="dashboard-machine-card__metric-label">
                      {t('dashboardPage.machineOutput', { defaultValue: 'Output' })}
                    </span>
                    <span className="dashboard-machine-card__metric-value">
                      {output === undefined ? '—' : formatNumber(output)}
                    </span>
                  </div>
                  <div className="dashboard-machine-card__metric">
                    <span className="dashboard-machine-card__metric-label">{t('dashboard.kpi.oee')}</span>
                    <span className="dashboard-machine-card__metric-value">
                      {oee === undefined ? '—' : `${oee.toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="dashboard-status-summary" aria-label={t('dashboardPage.machineStatusSummary', { defaultValue: 'Machine status summary' })}>
          <StatusSummaryItem tone="running" label={t('common.machineStatus.running', { defaultValue: 'Running' })} value={statusCounts.running} />
          <StatusSummaryItem tone="idle" label={t('common.machineStatus.idle', { defaultValue: 'Idle' })} value={statusCounts.idle} />
          <StatusSummaryItem tone="error" label={t('common.machineStatus.error', { defaultValue: 'Error' })} value={statusCounts.error} />
          <StatusSummaryItem
            tone="offline"
            label={t('common.machineStatus.offline', { defaultValue: 'Offline' })}
            value={statusCounts.offline + statusCounts.disconnected + statusCounts.stopped}
          />
        </div>
      </>
    );
  };

  return (
    <DashboardPanel
      title={title}
      description={description}
      icon={<Factory size={18} />}
      actions={line && machines.length > 0 ? <StatusBadge status={status} /> : undefined}
    >
      {renderState()}
    </DashboardPanel>
  );
}

function StatusSummaryItem({ tone, label, value }: { tone: 'running' | 'idle' | 'error' | 'offline'; label: string; value: number }) {
  return (
    <span className={`dashboard-status-summary__item dashboard-status-summary__item--${tone}`}>
      <span className="dashboard-status-summary__dot" aria-hidden="true" />
      {label}: <strong className="dashboard-status-summary__value">{value}</strong>
    </span>
  );
}
