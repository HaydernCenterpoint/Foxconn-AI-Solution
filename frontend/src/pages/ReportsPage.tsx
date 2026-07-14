import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Filter, Layers3, MonitorCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { linesApi } from '../features/production-lines/services/lines.api';
import { machinesApi, type Machine } from '../features/machines/services/machines.api';
import { api } from '../shared/services/apiClient';
import { Badge } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { StatCard } from '../shared/components/ui/StatCard';
import { Surface } from '../shared/components/ui/Surface';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { useDynamicTranslation } from '../shared/lib/translator';
import { useUiStore } from '../shared/store/ui.store';

type RecordValue = Record<string, unknown>;
type ReportMachine = Machine & { lineId?: string | null };

interface ReportMetric {
  key: string;
  label: string;
  value: number;
  suffix?: string;
  accent: 'primary' | 'success' | 'error' | 'info';
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function recordsFrom(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function getReportRows(data: unknown) {
  return isRecord(data) ? recordsFrom(data.tableLogs) : [];
}

function getSummary(data: unknown) {
  if (!isRecord(data) || !isRecord(data.summary)) return undefined;
  return data.summary;
}

function formatValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function csvCell(value: unknown) {
  const text = readText(value) ?? '';
  return `"${text.replace(/"/g, '""')}"`;
}

function getLogValue(row: RecordValue, key: string) {
  return row[key];
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const addToast = useUiStore((state) => state.addToast);
  const [selectedTimeRange, setSelectedTimeRange] = useState('today');
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [selectedMachineId, setSelectedMachineId] = useState('all');

  const locale = i18n.language === 'zh' || i18n.language === 'zh-CN'
    ? 'zh-CN'
    : i18n.language === 'en'
      ? 'en-US'
      : 'vi-VN';

  const linesQuery = useQuery({
    queryKey: ['reports-lines'],
    queryFn: linesApi.getAll,
  });

  const machinesQuery = useQuery({
    queryKey: ['machines-list-reports'],
    queryFn: machinesApi.getAll,
  });

  const reportQuery = useQuery({
    queryKey: ['reports-query', selectedTimeRange, selectedLineId, selectedMachineId],
    queryFn: () => api.get('/reports/query', {
      params: {
        timeRange: selectedTimeRange,
        lineId: selectedLineId,
        machineId: selectedMachineId,
      },
    }).then((response) => response.data),
  });

  const reportMachines = useMemo(() => (machinesQuery.data ?? []) as ReportMachine[], [machinesQuery.data]);
  const filteredMachines = useMemo(() => reportMachines.filter((machine) => {
    const isApproved = machine.approvalStatus?.toUpperCase() === 'APPROVED';
    if (!isApproved) return false;
    return selectedLineId === 'all' || machine.lineId === selectedLineId;
  }), [reportMachines, selectedLineId]);

  const summary = useMemo(() => getSummary(reportQuery.data), [reportQuery.data]);
  const tableRows = useMemo(() => getReportRows(reportQuery.data), [reportQuery.data]);
  const chartRows = useMemo(() => {
    if (!isRecord(reportQuery.data)) return [];
    return recordsFrom(reportQuery.data.chartData).flatMap((row) => {
      const label = readText(row.hour) ?? readText(row.date) ?? readText(row.label);
      const output = readNumber(row.output);
      return label && output !== undefined ? [{ label, output }] : [];
    });
  }, [reportQuery.data]);
  const defectRows = useMemo(() => {
    if (!isRecord(reportQuery.data)) return [];
    return recordsFrom(reportQuery.data.defectChartData).flatMap((row) => {
      const label = readText(row.name) ?? readText(row.label);
      const value = readNumber(row.value);
      return label && value !== undefined ? [{ label, value }] : [];
    });
  }, [reportQuery.data]);

  const metrics = useMemo<ReportMetric[]>(() => {
    if (!summary) return [];
    const candidates: Array<Omit<ReportMetric, 'value'> & { raw: unknown }> = [
      { key: 'totalProduction', label: t('reports.totalProduction', { defaultValue: 'Reported production' }), raw: summary.totalProduction, accent: 'primary' },
      { key: 'totalGood', label: t('reports.yield', { defaultValue: 'Reported good output' }), raw: summary.totalGood, accent: 'success' },
      { key: 'totalScrap', label: t('reports.scrap', { defaultValue: 'Reported scrap' }), raw: summary.totalScrap, accent: 'error' },
      { key: 'yieldRate', label: t('reports.yieldRate', { defaultValue: 'Reported yield' }), raw: summary.yieldRate, suffix: '%', accent: 'info' },
    ];

    return candidates.flatMap((candidate) => {
      const value = readNumber(candidate.raw);
      return value === undefined
        ? []
        : [{ key: candidate.key, label: candidate.label, value, suffix: candidate.suffix, accent: candidate.accent }];
    });
  }, [summary, t]);

  const hasReportContent = metrics.length > 0 || tableRows.length > 0 || chartRows.length > 0 || defectRows.length > 0;

  const exportCsv = () => {
    if (tableRows.length === 0) return;

    const headers = [
      t('reports.tableStt', { defaultValue: 'No.' }),
      t('reports.tableLine', { defaultValue: 'Production line' }),
      t('reports.tableMachine', { defaultValue: 'Machine' }),
      t('reports.tableOutput', { defaultValue: 'Output' }),
      t('reports.tableGood', { defaultValue: 'Good output' }),
      t('reports.tableScrap', { defaultValue: 'Scrap' }),
      t('reports.tableStatus', { defaultValue: 'Status' }),
    ];
    const csvRows = tableRows.map((row, index) => [
      getLogValue(row, 'no') ?? index + 1,
      getLogValue(row, 'lineName'),
      getLogValue(row, 'machineName'),
      getLogValue(row, 'output'),
      getLogValue(row, 'good'),
      getLogValue(row, 'scrap'),
      getLogValue(row, 'status'),
    ]);
    const csv = [headers, ...csvRows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production-report-${selectedTimeRange}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    addToast('success', t('reports.exportSuccess', { defaultValue: 'Exported loaded report rows as CSV' }));
  };

  const pageHeader = (
    <PageHeader
      eyebrow={t('reports.eyebrow', { defaultValue: 'Reporting workspace' })}
      title={t('reports.title', { defaultValue: 'Production report' })}
      description={t('reports.subtitle', { defaultValue: 'Review only values returned by the reporting service for the selected scope.' })}
      actions={(
        <Button
          variant="secondary"
          size="sm"
          startIcon={<Download size={16} aria-hidden="true" />}
          disabled={tableRows.length === 0}
          onClick={exportCsv}
          title={tableRows.length === 0 ? t('reports.exportUnavailable', { defaultValue: 'No loaded detail rows to export' }) : undefined}
        >
          {t('reports.exportCsv', { defaultValue: 'Export CSV' })}
        </Button>
      )}
    />
  );

  const filters = (
    <Surface variant="quiet" padding="md" className="toolbar">
      <label className="min-w-44 flex-1">
        <span className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary"><Filter size={14} aria-hidden="true" />{t('reports.filterTime', { defaultValue: 'Time range' })}</span>
        <select className="field" value={selectedTimeRange} onChange={(event) => setSelectedTimeRange(event.target.value)}>
          <option value="today">{t('reports.today', { defaultValue: 'Today' })}</option>
          <option value="shift_morning">{t('reports.shiftMorning', { defaultValue: 'Morning shift' })}</option>
          <option value="shift_night">{t('reports.shiftNight', { defaultValue: 'Night shift' })}</option>
          <option value="last_7_days">{t('reports.last7Days', { defaultValue: 'Last 7 days' })}</option>
          <option value="month">{t('reports.month', { defaultValue: 'This month' })}</option>
        </select>
      </label>
      <label className="min-w-44 flex-1">
        <span className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary"><Layers3 size={14} aria-hidden="true" />{t('reports.filterLine', { defaultValue: 'Production line' })}</span>
        <select
          className="field"
          value={selectedLineId}
          onChange={(event) => {
            setSelectedLineId(event.target.value);
            setSelectedMachineId('all');
          }}
        >
          <option value="all">{t('reports.allLines', { defaultValue: 'All lines' })}</option>
          {(linesQuery.data ?? []).map((line) => <option key={line.id} value={line.id}>{tDynamic(line.name)}</option>)}
        </select>
      </label>
      <label className="min-w-44 flex-1">
        <span className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary"><MonitorCog size={14} aria-hidden="true" />{t('reports.filterMachine', { defaultValue: 'Machine' })}</span>
        <select className="field" value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
          <option value="all">{t('reports.allMachines', { defaultValue: 'All approved machines' })}</option>
          {filteredMachines.map((machine) => <option key={machine.id} value={machine.id}>{tDynamic(machine.name)}</option>)}
        </select>
      </label>
    </Surface>
  );

  let reportContent: React.ReactNode;
  if (reportQuery.isLoading) {
    reportContent = (
      <Surface variant="raised">
        <DataState
          kind="loading"
          title={t('reports.loading', { defaultValue: 'Loading report' })}
          description={t('reports.loadingDescription', { defaultValue: 'Retrieving the selected report scope from the reporting service.' })}
        />
      </Surface>
    );
  } else if (reportQuery.isError) {
    reportContent = (
      <Surface variant="raised">
        <DataState
          kind="error"
          title={t('reports.errorTitle', { defaultValue: 'Report is unavailable' })}
          description={t('reports.errorDescription', { defaultValue: 'The reporting service could not be reached for the selected filters.' })}
          action={<Button variant="secondary" size="sm" onClick={() => void reportQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
        />
      </Surface>
    );
  } else if (!hasReportContent) {
    reportContent = (
      <Surface variant="raised">
        <DataState
          kind="empty"
          title={t('reports.noData', { defaultValue: 'No report data returned' })}
          description={t('reports.tableEmpty', { defaultValue: 'The reporting service returned no summary, trend, defect, or detail rows for this scope.' })}
        />
      </Surface>
    );
  } else {
    reportContent = (
      <div className="space-y-6">
        {metrics.length > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((metric) => (
              <StatCard
                key={metric.key}
                label={metric.label}
                value={`${formatValue(metric.value, locale)}${metric.suffix ?? ''}`}
                accent={metric.accent}
                icon={<FileText size={20} aria-hidden="true" />}
                hint={t('reports.reportedValue', { defaultValue: 'Reported value' })}
              />
            ))}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <Surface variant="raised" padding="none" className="overflow-hidden">
            <div className="panel-header">
              <div>
                <h2 className="title-small text-text-primary">{t('reports.chartHourlyTitle', { defaultValue: 'Reported output trend' })}</h2>
                <p className="mt-1 text-xs text-text-muted">{t('reports.chartHourlyDescription', { defaultValue: 'Only output points returned by the report are shown.' })}</p>
              </div>
            </div>
            {chartRows.length === 0 ? (
              <DataState kind="empty" title={t('reports.noTrend', { defaultValue: 'No output trend returned' })} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>{t('reports.period', { defaultValue: 'Period' })}</th><th className="text-right">{t('reports.tableOutput', { defaultValue: 'Output' })}</th></tr></thead>
                  <tbody>{chartRows.map((row, index) => <tr key={`${row.label}-${index}`}><td>{row.label}</td><td className="text-right font-mono">{formatValue(row.output, locale)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Surface>

          <Surface variant="raised" padding="none" className="overflow-hidden">
            <div className="panel-header">
              <div>
                <h2 className="title-small text-text-primary">{t('reports.defectTitle', { defaultValue: 'Reported defect categories' })}</h2>
                <p className="mt-1 text-xs text-text-muted">{t('reports.defectDescription', { defaultValue: 'Category counts supplied by the reporting service.' })}</p>
              </div>
            </div>
            {defectRows.length === 0 ? (
              <DataState kind="empty" title={t('reports.noDefects', { defaultValue: 'No defect categories returned' })} />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>{t('reports.category', { defaultValue: 'Category' })}</th><th className="text-right">{t('reports.count', { defaultValue: 'Count' })}</th></tr></thead>
                  <tbody>{defectRows.map((row, index) => <tr key={`${row.label}-${index}`}><td>{row.label}</td><td className="text-right font-mono">{formatValue(row.value, locale)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>

        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('reports.tableTitle', { defaultValue: 'Reported detail rows' })}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('reports.tableDescription', { defaultValue: 'These are the exact rows available for CSV export.' })}</p>
            </div>
            <Badge variant="neutral" size="sm">{t('reports.rowCount', { defaultValue: '{{count}} rows', count: tableRows.length })}</Badge>
          </div>
          {tableRows.length === 0 ? (
            <DataState kind="empty" title={t('reports.tableEmpty', { defaultValue: 'No detail rows returned' })} />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="data-table">
                  <thead><tr>
                    <th>{t('reports.tableStt', { defaultValue: 'No.' })}</th>
                    <th>{t('reports.tableLine', { defaultValue: 'Production line' })}</th>
                    <th>{t('reports.tableMachine', { defaultValue: 'Machine' })}</th>
                    <th className="text-right">{t('reports.tableOutput', { defaultValue: 'Output' })}</th>
                    <th className="text-right">{t('reports.tableGood', { defaultValue: 'Good output' })}</th>
                    <th className="text-right">{t('reports.tableScrap', { defaultValue: 'Scrap' })}</th>
                    <th>{t('reports.tableStatus', { defaultValue: 'Status' })}</th>
                  </tr></thead>
                  <tbody>{tableRows.map((row, index) => {
                    const status = readText(row.status);
                    return <tr key={readText(row.key) ?? `${index}`}>
                      <td className="font-mono text-text-muted">{readText(row.no) ?? String(index + 1)}</td>
                      <td>{readText(row.lineName) ?? '—'}</td>
                      <td className="font-medium text-text-primary">{readText(row.machineName) ?? '—'}</td>
                      <td className="text-right font-mono">{readNumber(row.output) === undefined ? '—' : formatValue(readNumber(row.output)!, locale)}</td>
                      <td className="text-right font-mono">{readNumber(row.good) === undefined ? '—' : formatValue(readNumber(row.good)!, locale)}</td>
                      <td className="text-right font-mono">{readNumber(row.scrap) === undefined ? '—' : formatValue(readNumber(row.scrap)!, locale)}</td>
                      <td>{status ? <StatusBadge status={status} size="sm" /> : '—'}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="space-y-3 p-3 md:hidden">{tableRows.map((row, index) => {
                const status = readText(row.status);
                return <Surface key={readText(row.key) ?? `${index}`} variant="quiet" padding="md" className="space-y-3">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-text-primary">{readText(row.machineName) ?? '—'}</p><p className="mt-1 text-xs text-text-muted">{readText(row.lineName) ?? '—'}</p></div>{status ? <StatusBadge status={status} size="sm" /> : null}</div>
                  <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm"><div><dt className="text-xs text-text-muted">{t('reports.tableOutput', { defaultValue: 'Output' })}</dt><dd className="mt-1 font-mono text-text-primary">{readNumber(row.output) === undefined ? '—' : formatValue(readNumber(row.output)!, locale)}</dd></div><div><dt className="text-xs text-text-muted">{t('reports.tableGood', { defaultValue: 'Good' })}</dt><dd className="mt-1 font-mono text-text-primary">{readNumber(row.good) === undefined ? '—' : formatValue(readNumber(row.good)!, locale)}</dd></div><div><dt className="text-xs text-text-muted">{t('reports.tableScrap', { defaultValue: 'Scrap' })}</dt><dd className="mt-1 font-mono text-text-primary">{readNumber(row.scrap) === undefined ? '—' : formatValue(readNumber(row.scrap)!, locale)}</dd></div></dl>
                </Surface>;
              })}</div>
            </>
          )}
        </Surface>
      </div>
    );
  }

  return <div className="space-y-6">{pageHeader}{filters}{reportContent}</div>;
}
