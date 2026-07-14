import { BarChart3, ChartNoAxesCombined } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HourlyPoint } from '../services/dashboard.api';
import type { Machine } from '../../machines/services/machines.api';
import { Button } from '../../../shared/components/ui/Button';
import { DataState } from '../../../shared/components/ui/DataState';
import { DashboardPanel } from './DashboardPanel';
import { getMachineMetric, readFiniteNumber } from './dashboardData';

interface ProductionTrendPanelProps {
  hourlyData?: HourlyPoint[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}

export function ProductionTrendPanel({ hourlyData = [], isLoading, isError, onRetry }: ProductionTrendPanelProps) {
  const { t } = useTranslation();
  const chartData = useMemo(() => hourlyData
    .filter((point) => Number.isInteger(point.prodHour) && readFiniteNumber(point.totalQty) !== undefined)
    .map((point) => ({
      time: `${String(point.prodHour).padStart(2, '0')}:00`,
      value: point.totalQty,
    })), [hourlyData]);

  return (
    <DashboardPanel
      title={t('dashboardPage.hourlyProductionTitle', { defaultValue: 'Hourly production' })}
      description={t('dashboardPage.hourlyProductionDescription', { defaultValue: 'Reported by the dashboard service.' })}
      icon={<ChartNoAxesCombined size={18} />}
      className="dashboard-analytics-grid__trend"
    >
      {isLoading ? (
        <DataState kind="loading" title={t('dashboardPage.loadingHourlyProduction', { defaultValue: 'Loading hourly production' })} />
      ) : isError ? (
        <DataState
          kind="error"
          title={t('dashboardPage.hourlyProductionError', { defaultValue: 'Hourly production is unavailable' })}
          description={t('dashboardPage.hourlyProductionErrorDescription', { defaultValue: 'The dashboard service did not return hourly production data.' })}
          action={onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      ) : chartData.length === 0 ? (
        <DataState
          kind="empty"
          title={t('dashboardPage.hourlyProductionEmpty', { defaultValue: 'No hourly production reported' })}
          description={t('dashboardPage.hourlyProductionEmptyDescription', { defaultValue: 'No hourly records are available for the current dashboard summary.' })}
        />
      ) : (
        <div className="dashboard-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
                width={44}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                name={t('dashboardPage.machineOutput', { defaultValue: 'Output' })}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-primary)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardPanel>
  );
}

interface MachineOeePanelProps {
  machines?: Machine[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  translateName: (value: string) => string;
}

export function MachineOeePanel({ machines = [], isLoading, isError, onRetry, translateName }: MachineOeePanelProps) {
  const { t } = useTranslation();
  const chartData = useMemo(() => machines
    .map((machine) => ({
      name: translateName(machine.name),
      oee: getMachineMetric(machine, 'oee'),
    }))
    .filter((machine): machine is { name: string; oee: number } => machine.oee !== undefined), [machines, translateName]);

  return (
    <DashboardPanel
      title={t('dashboardPage.machineOeeTitle', { defaultValue: 'Station OEE comparison' })}
      description={t('dashboardPage.machineOeeDescription', { defaultValue: 'Only stations reporting a live OEE value are included.' })}
      icon={<BarChart3 size={18} />}
    >
      {isLoading ? (
        <DataState kind="loading" title={t('dashboardPage.loadingMachines', { defaultValue: 'Loading stations' })} />
      ) : isError ? (
        <DataState
          kind="error"
          title={t('dashboardPage.machineOeeError', { defaultValue: 'Station OEE is unavailable' })}
          description={t('dashboardPage.machineOeeErrorDescription', { defaultValue: 'The machine service did not return a current station list.' })}
          action={onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          ) : undefined}
        />
      ) : chartData.length === 0 ? (
        <DataState
          kind="empty"
          title={t('dashboardPage.machineOeeEmpty', { defaultValue: 'No live OEE values reported' })}
          description={t('dashboardPage.machineOeeEmptyDescription', { defaultValue: 'Stations will appear here when their PLC telemetry includes OEE.' })}
        />
      ) : (
        <div className="dashboard-chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="var(--color-outline)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={54}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
                tickFormatter={(value) => `${value}%`}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip />
              <Bar dataKey="oee" name="OEE" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </DashboardPanel>
  );
}
