import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { linesApi } from '../features/production-lines/services/lines.api';
import { machinesApi } from '../features/machines/services/machines.api';
import { api } from '../shared/services/apiClient';
import { queryKeys } from '../app/queryKeys';
import {
  FileText,
  Calendar,
  Layers,
  Cpu,
  Download,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  Legend,
} from 'recharts';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [selectedTimeRange, setSelectedTimeRange] = useState('today');
  const [selectedLineId, setSelectedLineId] = useState('all');
  const [selectedMachineId, setSelectedMachineId] = useState('all');

  // Fetch Lines for Filter
  const { data: lines } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
  });

  // Fetch Machines for Filter & Data
  const { data: machines } = useQuery({
    queryKey: ['machines-list-reports'],
    queryFn: machinesApi.getAll,
  });

  // Filtered Machines based on line selection
  const filteredMachines = useMemo(() => {
    if (!machines) return [];
    return machines.filter((m: any) => {
      const isApproved = m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved';
      if (!isApproved) return false;
      if (selectedLineId !== 'all' && m.lineId !== selectedLineId) return false;
      return true;
    });
  }, [machines, selectedLineId]);

  // Fetch Report Data from Backend
  const { data: reportData } = useQuery({
    queryKey: ['reports-query', selectedTimeRange, selectedLineId, selectedMachineId],
    queryFn: () => api.get('/reports/query', {
      params: {
        timeRange: selectedTimeRange,
        lineId: selectedLineId,
        machineId: selectedMachineId,
      }
    }).then(r => r.data),
  });

  // Aggregate Metrics based on filters
  const metrics = useMemo(() => {
    return reportData?.summary ?? {
      totalProduction: 0,
      totalGood: 0,
      totalScrap: 0,
      yieldRate: 100,
      scrapRate: 0,
      avgSpeed: 0,
      machinesCount: 0
    };
  }, [reportData]);

  // Chart Data based on backend response
  const chartData = useMemo(() => {
    return reportData?.chartData ?? [];
  }, [reportData]);

  // Defect Distribution Category Chart Data
  const defectChartData = useMemo(() => {
    const rawData = reportData?.defectChartData ?? [];
    return rawData.map((d: any) => {
      let name = d.name;
      if (d.name === 'Kích thước') name = t('reports.defectDimension', 'Kích thước');
      else if (d.name === 'Bề mặt') name = t('reports.defectSurface', 'Bề mặt');
      else if (d.name === 'Mối hàn') name = t('reports.defectWelding', 'Mối hàn');
      else if (d.name === 'Lắp ráp') name = t('reports.defectAssembly', 'Lắp ráp');
      else if (d.name === 'Khác') name = t('reports.defectOther', 'Khác');
      return { ...d, name };
    });
  }, [reportData, t]);

  // Table Detailed Data Logs
  const tableLogs = useMemo(() => {
    return reportData?.tableLogs ?? [];
  }, [reportData]);

  const handleExport = () => {
    alert(t('common.actions.pending', 'Đang xử lý...') || 'Đang xuất báo cáo định dạng PDF/CSV. Vui lòng chờ...');
  };

  return (
    <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto w-full select-none pr-1">
      {/* 1. Header Title & Export controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0 border-b border-[#14356a]/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <h1 className="text-base font-black tracking-widest text-[#00f0ff] uppercase">
              {t('reports.title')}
            </h1>
          </div>
          <p className="text-[10px] font-bold text-text-muted mt-1 uppercase">
            {t('reports.subtitle')}
          </p>
        </div>

        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-cyan-400/40 bg-[#00f0ff]/10 text-cyan-400 hover:bg-[#00f0ff]/20 text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-[0_0_10px_rgba(0,240,255,0.1)]"
        >
          <Download className="h-3 w-3" />
          {t('reports.exportBtn')}
        </button>
      </div>

      {/* 2. Filters Bar */}
      <div className="cyber-panel rounded-none border border-[#14356a] bg-[#0A1129]/95 p-3.5 shrink-0 relative flex flex-wrap gap-4 items-center">
        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#00f0ff]" />
        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#00f0ff]" />

        {/* Calendar Filter */}
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-black text-text-secondary uppercase">{t('reports.filterTime')}</span>
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="bg-[#050b14] border border-[#14356a] text-white text-[10.5px] font-black px-2.5 py-1 rounded cursor-pointer hover:border-cyan-400/60 focus:outline-none"
          >
            <option value="today">{t('reports.today')}</option>
            <option value="shift_morning">{t('reports.shiftMorning')}</option>
            <option value="shift_night">{t('reports.shiftNight')}</option>
            <option value="last_7_days">{t('reports.last7Days')}</option>
            <option value="month">{t('reports.month')}</option>
          </select>
        </div>

        {/* Line Filter */}
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-black text-text-secondary uppercase">{t('reports.filterLine')}</span>
          <select
            value={selectedLineId}
            onChange={(e) => {
              setSelectedLineId(e.target.value);
              setSelectedMachineId('all');
            }}
            className="bg-[#050b14] border border-[#14356a] text-white text-[10.5px] font-black px-2.5 py-1 rounded cursor-pointer hover:border-cyan-400/60 focus:outline-none"
          >
            <option value="all">{t('reports.allLines')}</option>
            {lines?.map((line: any) => (
              <option key={line.id} value={line.id}>
                {line.name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        {/* Machine Filter */}
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-cyan-400" />
          <span className="text-[10px] font-black text-text-secondary uppercase">{t('reports.filterMachine')}</span>
          <select
            value={selectedMachineId}
            onChange={(e) => setSelectedMachineId(e.target.value)}
            className="bg-[#050b14] border border-[#14356a] text-white text-[10.5px] font-black px-2.5 py-1 rounded cursor-pointer hover:border-cyan-400/60 focus:outline-none"
          >
            <option value="all">{t('reports.allMachines')}</option>
            {filteredMachines.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        
        {/* KPI 1: Total Production */}
        <div className="cyber-panel border border-[#14356a] bg-[#0A1129]/80 p-3.5 relative flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[#00f0ff]" />
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('reports.totalProduction')}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-white font-mono leading-none">
              {metrics.totalProduction.toLocaleString()}
            </span>
            <span className="text-[8.5px] font-bold text-text-muted">sp</span>
          </div>
          <div className="flex items-center gap-1 text-[8.5px] font-black text-emerald-400 uppercase mt-2.5">
            <TrendingUp className="h-3 w-3 shrink-0" />
            Uptime: 96.8%
          </div>
        </div>

        {/* KPI 2: Good Products */}
        <div className="cyber-panel border border-emerald-500/25 bg-emerald-950/5 p-3.5 relative flex flex-col justify-between shadow-[0_0_15px_rgba(16,185,129,0.02)]">
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-emerald-500" />
          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{t('reports.yield')}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-emerald-400 font-mono leading-none">
              {metrics.totalGood.toLocaleString()}
            </span>
            <span className="text-[8.5px] font-black text-emerald-400/70">{metrics.yieldRate}%</span>
          </div>
          <div className="w-full bg-[#0a1a35] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${metrics.yieldRate}%` }} />
          </div>
        </div>

        {/* KPI 3: Defects/Scrap */}
        <div className="cyber-panel border border-rose-500/25 bg-rose-950/5 p-3.5 relative flex flex-col justify-between shadow-[0_0_15px_rgba(239,68,68,0.02)]">
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-rose-500" />
          <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">{t('reports.scrap')}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-rose-400 font-mono leading-none">
              {metrics.totalScrap.toLocaleString()}
            </span>
            <span className="text-[8.5px] font-black text-rose-400/70">{metrics.scrapRate}%</span>
          </div>
          <div className="w-full bg-[#0a1a35] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${metrics.scrapRate}%` }} />
          </div>
        </div>

        {/* KPI 4: Operating Speed */}
        <div className="cyber-panel border border-amber-500/25 bg-amber-950/5 p-3.5 relative flex flex-col justify-between shadow-[0_0_15px_rgba(245,158,11,0.02)]">
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-amber-500" />
          <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">{t('reports.uphSpeed')}</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-black text-amber-400 font-mono leading-none">
              {metrics.avgSpeed.toLocaleString()}
            </span>
            <span className="text-[8.5px] font-bold text-text-muted">sp/g</span>
          </div>
          <div className="flex items-center gap-1 text-[8.5px] font-black text-amber-400 uppercase mt-2.5">
            <Clock className="h-3 w-3 shrink-0" />
            Giám sát thời gian thực
          </div>
        </div>
      </div>

      {/* 4. Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0 min-h-[220px]">
        {/* Production Output History Chart */}
        <div className="lg:col-span-2 cyber-panel border border-[#14356a] bg-[#0A1129]/80 p-4 flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#00f0ff]" />
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 block mb-3 border-b border-[#14356a]/30 pb-2">{t('reports.chartHourlyTitle')}</span>
          <div className="flex-1 min-h-0 w-full text-[9px] font-bold">
            <ResponsiveContainer width="100%" height="90%">
              <AreaChart data={chartData} margin={{ top: 15, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaColorReport" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 2" stroke="#112240" vertical={false} />
                <XAxis dataKey="hour" stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} />
                <YAxis stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} width={30} />
                <Tooltip cursor={{ stroke: '#00f0ff', strokeWidth: 1 }} />
                <Area type="monotone" name="Sản lượng đạt" dataKey="output" stroke="#00f0ff" strokeWidth={2} fillOpacity={1} fill="url(#areaColorReport)" dot={{ stroke: '#00f0ff', strokeWidth: 1.5, fill: '#0a1129', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Defect Categories Distribution Chart */}
        <div className="cyber-panel border border-[#14356a] bg-[#0A1129]/80 p-4 flex flex-col justify-between">
          <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#00f0ff]" />
          <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 block mb-3 border-b border-[#14356a]/30 pb-2">{t('reports.defectTitle')}</span>
          <div className="flex-1 min-h-0 w-full text-[9px] font-bold">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defectChartData} layout="vertical" barSize={10} margin={{ top: 10, right: 30, left: -15, bottom: 0 }}>
                <XAxis type="number" stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} width={65} />
                <Tooltip cursor={{ fill: 'rgba(20, 53, 106, 0.15)' }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {defectChartData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Detailed Logs Table */}
      <div className="cyber-panel border border-[#14356a] bg-[#0A1129]/80 p-4 flex-1 flex flex-col min-h-[220px]">
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[#00f0ff]" />
        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 block mb-3 border-b border-[#14356a]/30 pb-2 shrink-0">{t('reports.tableTitle')}</span>
        <div className="flex-1 min-h-0 overflow-y-auto w-full">
          {tableLogs.length === 0 ? (
            <div className="text-center w-full py-12 text-sm font-bold text-text-secondary select-none">
              {t('reports.tableEmpty', 'Không có dữ liệu báo cáo cho thiết bị đã chọn.')}
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-[10px] font-bold">
              <thead>
                <tr className="border-b border-[#14356a]/60 text-slate-400 uppercase text-[9px] tracking-wider bg-[#050b14]/50">
                  <th className="py-2.5 px-3">{t('reports.tableStt')}</th>
                  <th className="py-2.5 px-3">{t('reports.tableLine')}</th>
                  <th className="py-2.5 px-3">{t('reports.tableMachine')}</th>
                  <th className="py-2.5 px-3 text-right">{t('reports.tableOutput')}</th>
                  <th className="py-2.5 px-3 text-right">{t('reports.tableGood')}</th>
                  <th className="py-2.5 px-3 text-right">{t('reports.tableScrap')}</th>
                  <th className="py-2.5 px-3 text-center">{t('reports.tableStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14356a]/20">
                {tableLogs.map((log: any) => {
                  const isRunning = log.status === 'running' || log.status === 'đang chạy';
                  const isError = log.status === 'error' || log.status === 'lỗi';
                  const isIdle = log.status === 'idle' || log.status === 'chờ';

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#14356a]/30 bg-[#0A1A35]/30 text-text-muted text-[8px] uppercase font-black">
                      Offline
                    </span>
                  );
                  if (isRunning) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-500/25 bg-emerald-500/5 text-emerald-400 text-[8px] uppercase font-black">
                        Running
                      </span>
                    );
                  } else if (isError) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/25 bg-rose-500/5 text-rose-500 text-[8px] uppercase font-black">
                        Error
                      </span>
                    );
                  } else if (isIdle) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/5 text-amber-400 text-[8px] uppercase font-black">
                        Standby
                      </span>
                    );
                  }

                  return (
                    <tr key={log.key} className="hover:bg-[#070c1e]/40 transition-colors">
                      <td className="py-2.5 px-3 text-[#00f0ff] font-mono">{log.no}</td>
                      <td className="py-2.5 px-3 text-slate-300">{log.lineName}</td>
                      <td className="py-2.5 px-3 text-white uppercase">{log.machineName}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-white">{log.output.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-400">{log.good.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-400">{log.scrap.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-center">{statusBadge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
