import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { linesApi } from '../features/production-lines/services/lines.api';
import { machinesApi } from '../features/machines/services/machines.api';
import { api } from '../shared/services/apiClient';
import { queryKeys } from '../app/queryKeys';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  FileText,
  Layers,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './modern-reports.css';

interface ReportLine {
  id: string;
  name: string;
}

interface ReportMachine {
  approvalStatus?: string;
  id: string;
  lineId?: string;
  name: string;
}

interface ReportMetrics {
  avgSpeed: number;
  machinesCount: number;
  scrapRate: number;
  totalGood: number;
  totalProduction: number;
  totalScrap: number;
  yieldRate: number;
}

interface ReportChartPoint {
  hour: string;
  output: number;
}

interface ReportDefect {
  color?: string;
  name: string;
  value: number;
}

interface ReportLog {
  good: number;
  key: string;
  lineName: string;
  machineName: string;
  no: number;
  output: number;
  scrap: number;
  status: string;
}

interface ReportData {
  chartData?: ReportChartPoint[];
  defectChartData?: ReportDefect[];
  summary?: ReportMetrics;
  tableLogs?: ReportLog[];
}

const emptyMetrics: ReportMetrics = {
  avgSpeed: 0,
  machinesCount: 0,
  scrapRate: 0,
  totalGood: 0,
  totalProduction: 0,
  totalScrap: 0,
  yieldRate: 100,
};

function getReportStatus(status: string) {
  const normalizedStatus = status.toLocaleLowerCase();

  if (normalizedStatus === 'running' || normalizedStatus === 'đang chạy') {
    return { label: 'Running', tone: 'running' };
  }

  if (normalizedStatus === 'error' || normalizedStatus === 'lỗi') {
    return { label: 'Error', tone: 'error' };
  }

  if (normalizedStatus === 'idle' || normalizedStatus === 'chờ') {
    return { label: 'Standby', tone: 'idle' };
  }

  return { label: 'Offline', tone: 'offline' };
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [selectedTimeRange, setSelectedTimeRange] = useState('today');
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [selectedMachineId, setSelectedMachineId] = useState('all');

  const { data: lines } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
  });

  const { data: machines } = useQuery({
    queryKey: ['machines-list-reports'],
    queryFn: machinesApi.getAll,
  });

  const reportLines = (lines ?? []) as ReportLine[];

  const filteredMachines = useMemo(() => {
    const reportMachines = (machines ?? []) as ReportMachine[];
    return reportMachines.filter((machine) => {
      const isApproved = machine.approvalStatus === 'APPROVED' || machine.approvalStatus === 'approved';
      return isApproved && (selectedLineId === 'all' || machine.lineId === selectedLineId);
    });
  }, [machines, selectedLineId]);

  const { data: reportData } = useQuery({
    queryKey: ['reports-query', selectedTimeRange, selectedLineId, selectedMachineId],
    queryFn: () => api.get<ReportData>('/reports/query', {
      params: {
        timeRange: selectedTimeRange,
        lineId: selectedLineId,
        machineId: selectedMachineId,
      },
    }).then((response) => response.data),
  });

  const metrics = reportData?.summary ?? emptyMetrics;
  const chartData = reportData?.chartData ?? [];
  const tableLogs = reportData?.tableLogs ?? [];
  const defectChartData = useMemo(() => (reportData?.defectChartData ?? []).map((defect) => {
    const translatedName = {
      'Kích thước': t('reports.defectDimension', 'Dimension'),
      'Bề mặt': t('reports.defectSurface', 'Surface'),
      'Mối hàn': t('reports.defectWelding', 'Welding'),
      'Lắp ráp': t('reports.defectAssembly', 'Assembly'),
      Khác: t('reports.defectOther', 'Other'),
    }[defect.name];

    return { ...defect, name: translatedName ?? defect.name };
  }), [reportData?.defectChartData, t]);

  const handleExport = () => {
    alert(t('common.actions.pending', 'Preparing PDF/CSV report…'));
  };

  const yieldWidth = Math.max(0, Math.min(100, metrics.yieldRate));
  const scrapWidth = Math.max(0, Math.min(100, metrics.scrapRate));

  return (
    <div className="reports-page">
      <header className="reports-page__header">
        <div>
          <p className="reports-page__eyebrow"><FileText size={14} aria-hidden="true" /> {t('navigation.reports')}</p>
          <h1>{t('reports.title')}</h1>
          <p className="reports-page__subtitle">{t('reports.subtitle')}</p>
        </div>
        <button type="button" onClick={handleExport} className="reports-page__export">
          <Download size={16} aria-hidden="true" />
          {t('reports.exportBtn')}
        </button>
      </header>

      <section className="reports-page__filters" aria-label={t('reports.title')}>
        <label className="reports-page__filter">
          <span><Calendar size={15} aria-hidden="true" />{t('reports.filterTime')}</span>
          <select value={selectedTimeRange} onChange={(event) => setSelectedTimeRange(event.target.value)}>
            <option value="today">{t('reports.today')}</option>
            <option value="shift_morning">{t('reports.shiftMorning')}</option>
            <option value="shift_night">{t('reports.shiftNight')}</option>
            <option value="last_7_days">{t('reports.last7Days')}</option>
            <option value="month">{t('reports.month')}</option>
          </select>
        </label>
        <label className="reports-page__filter">
          <span><Layers size={15} aria-hidden="true" />{t('reports.filterLine')}</span>
          <select value={selectedLineId} onChange={(event) => {
            setSelectedLineId(event.target.value);
            setSelectedMachineId('all');
          }}>
            <option value="all">{t('reports.allLines')}</option>
            {reportLines.map((line) => <option key={line.id} value={line.id}>{line.name.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="reports-page__filter">
          <span><Cpu size={15} aria-hidden="true" />{t('reports.filterMachine')}</span>
          <select value={selectedMachineId} onChange={(event) => setSelectedMachineId(event.target.value)}>
            <option value="all">{t('reports.allMachines')}</option>
            {filteredMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name.toUpperCase()}</option>)}
          </select>
        </label>
      </section>

      <section className="reports-page__metrics" aria-label={t('reports.title')}>
        <article className="reports-page__metric">
          <span className="reports-page__metric-icon"><TrendingUp size={18} aria-hidden="true" /></span>
          <p>{t('reports.totalProduction')}</p>
          <strong>{metrics.totalProduction.toLocaleString()}</strong>
          <small>{t('reports.metrics.outputMeta', { unit: t('dashboardPage.pcsUnit'), uptime: '96.8' })}</small>
        </article>
        <article className="reports-page__metric is-success">
          <span className="reports-page__metric-icon"><CheckCircle2 size={18} aria-hidden="true" /></span>
          <p>{t('reports.yield')}</p>
          <strong>{metrics.totalGood.toLocaleString()}</strong>
          <small>{metrics.yieldRate}%</small>
          <span className="reports-page__meter"><i style={{ width: `${yieldWidth}%` }} /></span>
        </article>
        <article className="reports-page__metric is-danger">
          <span className="reports-page__metric-icon"><AlertTriangle size={18} aria-hidden="true" /></span>
          <p>{t('reports.scrap')}</p>
          <strong>{metrics.totalScrap.toLocaleString()}</strong>
          <small>{metrics.scrapRate}%</small>
          <span className="reports-page__meter"><i style={{ width: `${scrapWidth}%` }} /></span>
        </article>
        <article className="reports-page__metric is-amber">
          <span className="reports-page__metric-icon"><Clock size={18} aria-hidden="true" /></span>
          <p>{t('reports.uphSpeed')}</p>
          <strong>{metrics.avgSpeed.toLocaleString()}</strong>
          <small>{t('reports.metrics.speedMeta', { unit: t('dashboardPage.pcsUnit'), status: t('common.status.online') })}</small>
        </article>
      </section>

      <section className="reports-page__charts">
        <article className="reports-page__panel reports-page__panel--wide">
          <header><h2>{t('reports.chartHourlyTitle')}</h2></header>
          <div className="reports-page__chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 16, right: 16, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="reports-area-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 4" stroke="#343434" vertical={false} />
                <XAxis dataKey="hour" stroke="#9a9a9a" tickLine={false} axisLine={false} />
                <YAxis stroke="#9a9a9a" tickLine={false} axisLine={false} width={36} />
                <Tooltip cursor={{ stroke: 'var(--color-primary)', strokeWidth: 1 }} contentStyle={{ background: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline)', borderRadius: 10 }} />
                <Area type="monotone" name={t('reports.totalProduction')} dataKey="output" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#reports-area-red)" dot={{ stroke: 'var(--color-primary)', strokeWidth: 1.5, fill: 'var(--color-surface-container)', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="reports-page__panel">
          <header><h2>{t('reports.defectTitle')}</h2></header>
          <div className="reports-page__chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defectChartData} layout="vertical" barSize={12} margin={{ top: 10, right: 18, left: 8, bottom: 0 }}>
                <XAxis type="number" stroke="#9a9a9a" tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#9a9a9a" tickLine={false} axisLine={false} width={78} />
                <Tooltip cursor={{ fill: 'rgba(239, 68, 68, .08)' }} contentStyle={{ background: '#252525', border: '1px solid #4a4a4a', borderRadius: 10 }} />
                <Bar dataKey="value" radius={[0, 5, 5, 0]}>
                  {defectChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color || 'var(--color-error)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="reports-page__panel reports-page__table-panel">
        <header><h2>{t('reports.tableTitle')}</h2></header>
        <div className="reports-page__table-wrap">
          {tableLogs.length === 0 ? (
            <div className="reports-page__empty">{t('reports.tableEmpty', 'No report data for the selected equipment.')}</div>
          ) : (
            <table>
              <thead><tr>
                <th>{t('reports.tableStt')}</th><th>{t('reports.tableLine')}</th><th>{t('reports.tableMachine')}</th>
                <th>{t('reports.tableOutput')}</th><th>{t('reports.tableGood')}</th><th>{t('reports.tableScrap')}</th><th>{t('reports.tableStatus')}</th>
              </tr></thead>
              <tbody>{tableLogs.map((log) => {
                const status = getReportStatus(log.status);
                return <tr key={log.key}>
                  <td>{log.no}</td><td>{log.lineName}</td><td>{log.machineName}</td>
                  <td>{log.output.toLocaleString()}</td><td>{log.good.toLocaleString()}</td><td>{log.scrap.toLocaleString()}</td>
                  <td><span className={`reports-page__status is-${status.tone}`}>{status.label}</span></td>
                </tr>;
              })}</tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
