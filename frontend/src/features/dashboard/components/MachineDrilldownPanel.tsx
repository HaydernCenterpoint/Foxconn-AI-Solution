
import { useMemo } from 'react';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HourlyProduction, Machine } from '../../machines/services/machines.api';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { formatDateTime, formatDuration, formatNumber } from '../../../shared/lib/utils';
import { DashboardPanel } from './DashboardPanel';
import { getMachineMetric } from './dashboardData';

interface MachineDrilldownPanelProps {
  machine: Machine | null;
  history?: HourlyProduction[];
  isHistoryLoading: boolean;
  isHistoryError: boolean;
  onRetryHistory?: () => void;
  translateName: (value: string) => string;
}

export function MachineDrilldownPanel({
  machine,
  history = [],
  isHistoryLoading,
  isHistoryError,
  onRetryHistory,
  translateName,
}: MachineDrilldownPanelProps) {
  const { t } = useTranslation();

  const historyData = useMemo(() => history
    .filter((point) => Boolean(point.prodDate || point.receivedAt))
    .map((point) => ({
      time: `${point.prodDate} ${String(point.prodHour).padStart(2, '0')}:00`,
      value: point.hourlyQty,
    })), [history]);

  if (!machine) {
    return (
      <DashboardPanel
        title={t('dashboardPage.machineDetailsTitle', { defaultValue: 'Station details' })}
        description={t('dashboardPage.machineDetailsDescription', { defaultValue: 'Select a station to inspect its reported telemetry.' })}
        icon={<MaterialSymbol name="monitoring" size={18} />}
      >
        <DataState
          kind="empty"
          title={t('dashboardPage.selectMachineTitle', { defaultValue: 'Select a station' })}
          description={t('dashboardPage.selectMachineDescription', { defaultValue: 'Choose a station from the line operations panel to view its live values.' })}
        />
      </DashboardPanel>
    );
  }

  const output = getMachineMetric(machine, 'output');
  const oee = getMachineMetric(machine, 'oee');
  const yieldRate = getMachineMetric(machine, 'yieldRate');
  const uph = getMachineMetric(machine, 'uph');
  const runtime = getMachineMetric(machine, 'runtime');
  const hasTelemetry = Boolean(machine.lastPlcData);

  const metrics = [
    {
      label: t('dashboardPage.machineOutput', { defaultValue: 'Output' }),
      value: output === undefined ? '—' : formatNumber(output),
    },
    {
      label: 'OEE',
      value: oee === undefined ? '—' : `${oee.toFixed(1)}%`,
    },
    {
      label: t('dashboardPage.yieldRate', { defaultValue: 'Yield rate' }),
      value: yieldRate === undefined ? '—' : `${yieldRate.toFixed(1)}%`,
    },
    {
      label: 'UPH',
      value: uph === undefined ? '—' : formatNumber(uph),
    },
    {
      label: t('dashboardPage.machineRuntime', { defaultValue: 'Machine runtime' }),
      value: runtime === undefined ? '—' : formatDuration(runtime),
    },
  ];

  const historyState = () => {
    if (isHistoryLoading) {
      return (
        <DataState
          kind="loading"
          title={t('dashboardPage.loadingMachineHistory', { defaultValue: 'Loading hourly output' })}
        />
      );
    }

    if (isHistoryError) {
      return (
        <DataState
          kind="error"
          title={t('dashboardPage.machineHistoryError', { defaultValue: 'Hourly output is unavailable' })}
          description={t('dashboardPage.machineHistoryErrorDescription', { defaultValue: 'The selected station did not return hourly production data.' })}
          action={onRetryHistory ? (
            <Button variant="secondary" size="sm" onClick={onRetryHistory}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      );
    }

    if (historyData.length === 0) {
      return (
        <DataState
          kind="empty"
          title={t('dashboardPage.machineHistoryEmpty', { defaultValue: 'No hourly output reported' })}
          description={t('dashboardPage.machineHistoryEmptyDescription', { defaultValue: 'This station has not returned hourly production records.' })}
        />
      );
    }

    return (
      <div className="dashboard-chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={historyData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              name={t('dashboardPage.machineHourlyOutput', { defaultValue: 'Hourly output' })}
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-primary)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <DashboardPanel
      title={translateName(machine.name)}
      description={machine.machineCode ?? machine.clientId ?? machine.id}
      icon={<MaterialSymbol name="monitoring" size={18} />}
      actions={<StatusBadge status={machine.status} />}
    >
      <div className="dashboard-detail__meta">
        <span className="dashboard-detail__updated">
          {machine.lastPlcData?.timestamp
            ? t('dashboardPage.lastTelemetry', {
              defaultValue: 'Last telemetry: {{time}}',
              time: formatDateTime(machine.lastPlcData.timestamp),
            })
            : t('dashboardPage.noTelemetryTimestamp', { defaultValue: 'No telemetry timestamp reported' })}
        </span>
      </div>
      {!hasTelemetry ? (
        <DataState
          kind="empty"
          title={t('dashboardPage.noMachineTelemetry', { defaultValue: 'No live telemetry reported' })}
          description={t('dashboardPage.noMachineTelemetryDescription', { defaultValue: 'The station is configured, but it has not returned PLC telemetry yet.' })}
        />
      ) : (
        <>
          <div className="dashboard-detail__metrics">
            {metrics.map((metric) => (
              <div className="dashboard-detail__metric" key={metric.label}>
                <span className="dashboard-detail__label">{metric.label}</span>
                <strong className="dashboard-detail__value">{metric.value}</strong>
              </div>
            ))}
          </div>
          <section className="dashboard-history">
            <div className="dashboard-history__header">
              <h3 className="dashboard-history__title">
                {t('dashboardPage.machineHourlyOutput', { defaultValue: 'Hourly output' })}
              </h3>
              <span className="dashboard-history__label"><MaterialSymbol name="schedule" size={14} /> {t('dashboardPage.sourceMachineApi', { defaultValue: 'Machine API' })}</span>
            </div>
            {historyState()}
          </section>
        </>
      )}
    </DashboardPanel>
  );
}
