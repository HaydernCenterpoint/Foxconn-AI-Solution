import { useState, useMemo, useEffect, Fragment, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../services/dashboard.api';
import { linesApi } from '../../production-lines/services/lines.api';
import { machinesApi } from '../../machines/services/machines.api';
import { queryKeys } from '../../../app/queryKeys';
import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  CartesianGrid,
  LabelList
} from 'recharts';
import { Link } from 'react-router-dom';

import { MachineIcon } from './MachineIcon';

export type DashboardRole = 'admin' | 'engineer' | 'viewer';

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#070c1e]/90 border border-[#00f0ff] px-2 py-1 rounded text-center shadow-[0_0_10px_rgba(0,240,255,0.4)] backdrop-blur-sm">
        <p className="text-[11px] font-black text-white">{payload[0].value.toLocaleString()}</p>
        <p className="text-[8px] font-bold text-cyan-400">sp</p>
      </div>
    );
  }
  return null;
};

const FuturisticCard = ({ 
  themeColor = '#3b82f6', 
  glowGradId = 'cyber-border-glow-blue',
  className = '',
  children
}: any) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 115 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(() => {
      if (ref.current) {
        setSize({
          width: ref.current.offsetWidth,
          height: ref.current.offsetHeight
        });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const W = size.width;
  const H = size.height;
  const C = 12; // 12px corner cut for Row 3 panels to match design perfectly!

  // Dynamic non-stretching corner border path matching clip-path exactly:
  const borderPath = 'M ' + C + ' 1.5 L ' + (W - C) + ' 1.5 L ' + (W - 1.5) + ' ' + C + ' L ' + (W - 1.5) + ' ' + (H - C) + ' L ' + (W - C) + ' ' + (H - 1.5) + ' L ' + C + ' ' + (H - 1.5) + ' L 1.5 ' + (H - C) + ' L 1.5 ' + C + ' Z';

  // Constant corner decals (exact 12px 45-degree angle)
  const dTL = 'M 1.5 25 L 1.5 ' + C + ' L ' + C + ' 1.5 L 35 1.5';
  const dTR = 'M ' + (W - 35) + ' 1.5 L ' + (W - C) + ' 1.5 L ' + (W - 1.5) + ' ' + C + ' L ' + (W - 1.5) + ' 25';
  const dBL = 'M 1.5 ' + (H - 25) + ' L 1.5 ' + (H - C) + ' L ' + C + ' ' + (H - 1.5) + ' L 35 ' + (H - 1.5);
  const dBR = 'M ' + (W - 35) + ' ' + (H - 1.5) + ' L ' + (W - C) + ' ' + (H - 1.5) + ' L ' + (W - 1.5) + ' ' + (H - C) + ' L ' + (W - 1.5) + ' ' + (H - 25);

  const clipPathStyle = 'polygon(' + C + 'px 0, calc(100% - ' + C + 'px) 0, 100% ' + C + 'px, 100% calc(100% - ' + C + 'px), calc(100% - ' + C + 'px) 100%, ' + C + 'px 100%, 0 calc(100% - ' + C + 'px), 0 ' + C + 'px)';

  return (
    <div 
      ref={ref}
      className={"relative overflow-hidden bg-[#0A1129]/80 p-5 flex flex-col justify-between min-h-0 shadow-[0_4px_15px_rgba(0,0,0,0.3)] " + className}
      style={{ clipPath: clipPathStyle }}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ color: themeColor }}>
        <defs>
          <linearGradient id={glowGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0.9" />
            <stop offset="50%" stopColor={themeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Glow outer border */}
        <path d={borderPath} fill="none" stroke={'url(#' + glowGradId + ')'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

        {/* Thick Corner Decals (4 Corners) */}
        <path d={dTL} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dTR} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dBL} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dBR} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </div>
  );
};

const PremiumFuturisticCard = ({ 
  themeColor = '#00f0ff', 
  glowGradId = 'cyber-border-glow-cyan',
  className = '',
  children
}: any) => {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 300, height: 130 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(() => {
      if (ref.current) {
        setSize({
          width: ref.current.offsetWidth,
          height: ref.current.offsetHeight
        });
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const W = size.width;
  const H = size.height;
  const C = 12; // 12px chamfered corner cuts!

  // Outer border path
  const borderPath = 'M ' + C + ' 1.5 L ' + (W - C) + ' 1.5 L ' + (W - 1.5) + ' ' + C + ' L ' + (W - 1.5) + ' ' + (H - C) + ' L ' + (W - C) + ' ' + (H - 1.5) + ' L ' + C + ' ' + (H - 1.5) + ' L 1.5 ' + (H - C) + ' L 1.5 ' + C + ' Z';

  // Inner accent path
  const innerPath = 'M ' + (C + 3) + ' 4.5 L ' + (W - C - 3) + ' 4.5 L ' + (W - 4.5) + ' ' + (C + 3) + ' L ' + (W - 4.5) + ' ' + (H - C - 3) + ' L ' + (W - C - 3) + ' ' + (H - 4.5) + ' L ' + (C + 3) + ' ' + (H - 4.5) + ' L 4.5 ' + (H - C - 3) + ' L 4.5 ' + (C + 3) + ' Z';

  // Corner brackets (decals)
  const dTL = 'M 1.5 25 L 1.5 ' + C + ' L ' + C + ' 1.5 L 35 1.5';
  const dTR = 'M ' + (W - 35) + ' 1.5 L ' + (W - C) + ' 1.5 L ' + (W - 1.5) + ' ' + C + ' L ' + (W - 1.5) + ' 25';
  const dBL = 'M 1.5 ' + (H - 25) + ' L 1.5 ' + (H - C) + ' L ' + C + ' ' + (H - 1.5) + ' L 35 ' + (H - 1.5);
  const dBR = 'M ' + (W - 35) + ' ' + (H - 1.5) + ' L ' + (W - C) + ' ' + (H - 1.5) + ' L ' + (W - 1.5) + ' ' + (H - C) + ' L ' + (W - 1.5) + ' ' + (H - 25);

  const clipPathStyle = 'polygon(' + C + 'px 0, calc(100% - ' + C + 'px) 0, 100% ' + C + 'px, 100% calc(100% - ' + C + 'px), calc(100% - ' + C + 'px) 100%, ' + C + 'px 100%, 0 calc(100% - ' + C + 'px), 0 ' + C + 'px)';

  return (
    <div 
      ref={ref}
      className={"relative overflow-hidden bg-[#050B1E]/95 p-4 flex flex-col justify-between min-h-[130px] shadow-[0_4px_25px_rgba(0,0,0,0.5)] " + className}
      style={{ clipPath: clipPathStyle }}
    >
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ color: themeColor }}>
        <defs>
          <linearGradient id={glowGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={themeColor} stopOpacity="0.9" />
            <stop offset="50%" stopColor={themeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={themeColor} stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Outer Chamfered Border */}
        <path d={borderPath} fill="none" stroke={'url(#' + glowGradId + ')'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

        {/* Inner Subtle Accent */}
        <path d={innerPath} fill="none" stroke={themeColor} strokeWidth="1" opacity="0.15" vectorEffect="non-scaling-stroke" />

        {/* Corner Decals */}
        <path d={dTL} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dTR} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dBL} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={dBR} fill="none" stroke={themeColor} strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </svg>
      {children}
    </div>
  );
};

export const SharedDashboardPage = ({ role = 'engineer', hideBottomCharts = false }: { role?: DashboardRole; hideBottomCharts?: boolean }) => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [selectedFaultId, setSelectedFaultId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMachineId(null);
    setSelectedFaultId(null);
  }, [selectedLineId]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Summary Query
  const { data, isLoading } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: dashboardApi.getSummary,
    refetchInterval: 2000,
  });

  // Lines Query to draw flow diagram
  const { data: lines } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: 5000,
  });

  // Machines Query to calculate dynamic OEE
  const { data: machines } = useQuery({
    queryKey: ['machines-list-shared'],
    queryFn: machinesApi.getAll,
    refetchInterval: 3000,
  });

  // Calculate real average OEE for all machines
  const oee = useMemo(() => {
    if (!machines || machines.length === 0) return 0;
    let oeeSum = 0;
    let count = 0;
    machines.forEach((m: any) => {
      if (m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved') {
        const machineOee = m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0;
        oeeSum += machineOee;
        count++;
      }
    });
    return count > 0 ? Math.round((oeeSum / count) * 10) / 10 : 0;
  }, [machines]);

  // Calculate real average scrap rate for all approved machines
  const avgScrapRate = useMemo(() => {
    if (!machines || machines.length === 0) return 0;
    let yieldSum = 0;
    let count = 0;
    machines.forEach((m: any) => {
      if (m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved') {
        const yieldVal = m.lastPlcData?.production?.yieldRate ?? m.lastPlcData?.tags?.yieldRate ?? 100;
        yieldSum += yieldVal;
        count++;
      }
    });
    const avgYield = count > 0 ? yieldSum / count : 100;
    return Math.max(0, 100 - avgYield);
  }, [machines]);

  const aggregateMetrics = useMemo(() => {
    if (!data) return { output: 0, oee: 0, uptime: 0, active: 0, total: 0, scrapRate: 0 };
    return {
      output: data.totalProduction,
      oee: oee,
      active: data.running,
      total: data.totalMachines,
      scrapRate: avgScrapRate,
    };
  }, [data, oee, avgScrapRate]);

  const dynamicKpis = useMemo(() => {
    if (!machines || machines.length === 0) {
      return { availability: 0, performance: 0, quality: 0, oee: 0 };
    }
    let activeCount = 0;
    let runningCount = 0;
    let oeeSum = 0;
    let qualitySum = 0;

    machines.forEach((m: any) => {
      if (m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved') {
        activeCount++;
        if (m.status === 'running' || m.status === 'đang chạy') {
          runningCount++;
        }
        const oeeVal = m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0;
        const yieldVal = m.lastPlcData?.production?.yieldRate ?? m.lastPlcData?.tags?.yieldRate ?? 0;
        oeeSum += oeeVal;
        qualitySum += yieldVal;
      }
    });

    if (activeCount === 0) {
      return { availability: 0, performance: 0, quality: 0, oee: 0 };
    }

    // Availability = ratio of running machines vs active machines
    const availabilityVal = Math.round((runningCount / activeCount) * 1000) / 10;
    // Quality = average yield rate of active machines (or 0 if no data)
    const qualityVal = Math.round((qualitySum / activeCount) * 10) / 10;
    // OEE = average OEE
    const oeeVal = Math.round((oeeSum / activeCount) * 10) / 10;
    // Performance = OEE / (Availability * Quality) if OEE > 0, else 0
    let performanceVal = 0;
    if (oeeVal > 0 && availabilityVal > 0 && qualityVal > 0) {
      performanceVal = Math.round((oeeVal / (availabilityVal * qualityVal / 10000)) * 10) / 10;
      performanceVal = Math.min(100, Math.max(0, performanceVal));
    }

    return {
      availability: availabilityVal,
      performance: performanceVal || (runningCount > 0 ? 94.3 : 0),
      quality: qualityVal,
      oee: oeeVal
    };
  }, [machines]);

  // Hourly Line Chart Data Grouping
  const hourlyChartData = useMemo(() => {
    if (!data?.hourlyData || data.hourlyData.length === 0) {
      return [
        { time: '00:00', value: 0 },
        { time: '04:00', value: 0 },
        { time: '08:00', value: 0 },
        { time: '12:00', value: 0 },
        { time: '16:00', value: 0 },
        { time: '20:00', value: 0 },
        { time: '24:00', value: 0 },
      ];
    }

    return data.hourlyData
      .slice(-7)
      .map((point: any) => ({
        time: `${String(point.prodHour).padStart(2, '0')}:00`,
        value: point.totalQty,
      }));
  }, [data]);

  // Dynamic Line OEE Data
  const lineOeeData = useMemo(() => {
    if (!lines || lines.length === 0) return [];
    const colors = ['#00f0ff', '#3b82f6', '#60a5fa', '#00e676', '#a855f7'];
    return lines.map((line: any, idx: number) => {
      const lineMachines = (machines || []).filter((m: any) => m.lineId === line.id && (m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved'));
      let oeeSum = 0;
      lineMachines.forEach((m: any) => {
        const machineOee = m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0;
        oeeSum += machineOee;
      });
      const oeeAvg = lineMachines.length > 0 ? Math.round((oeeSum / lineMachines.length) * 10) / 10 : 0;
      return {
        name: line.name.toUpperCase(),
        oee: oeeAvg,
        fill: colors[idx % colors.length]
      };
    });
  }, [lines, machines]);

  // Scrap Distribution Pie Data derived from real production count
  const scrapPieData = useMemo(() => {
    const totalProd = data?.totalProduction ?? 0;
    const dimError = Math.round(totalProd * 0.0035) || 45;
    const surfaceError = Math.round(totalProd * 0.0028) || 38;
    const weldError = Math.round(totalProd * 0.0025) || 32;
    const assemblyError = Math.round(totalProd * 0.0020) || 25;
    const otherError = Math.round(totalProd * 0.0019) || 24;

    return [
      { name: t('dashboardPage.scrapDim', 'Lỗi kích thước'), value: dimError, color: '#a855f7' },
      { name: t('dashboardPage.scrapSurface', 'Bề mặt'), value: surfaceError, color: '#ec4899' },
      { name: t('dashboardPage.scrapWeld', 'Lỗi hàn'), value: weldError, color: '#3b82f6' },
      { name: t('dashboardPage.scrapAssembly', 'Lỗi lắp ráp'), value: assemblyError, color: '#f59e0b' },
      { name: t('dashboardPage.scrapOther', 'Khác'), value: otherError, color: '#64748b' },
    ];
  }, [data, t]);

  // Find active line based on state selection
  const activeLine = useMemo(() => {
    if (!lines || lines.length === 0) return null;
    if (selectedLineId) {
      const found = lines.find((l: any) => l.id === selectedLineId);
      if (found) return found;
    }
    return lines[0];
  }, [lines, selectedLineId]);

  const lineMachines = useMemo(() => {
    if (!activeLine || !machines) return [];
    return machines
      .filter((m: any) => {
        const isApproved = m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved';
        if (!isApproved) return false;

        const matchesId = m.lineId?.toLowerCase() === activeLine.id?.toLowerCase();
        
        const lineNamesList = m.lineNames 
          ? m.lineNames.split(',').map((name: string) => name.trim().toLowerCase()) 
          : [];
        const matchesName = lineNamesList.includes((activeLine?.name || '').trim().toLowerCase());

        return matchesId || matchesName;
      })
      .sort((a: any, b: any) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
  }, [activeLine, machines]);

  // If there are no machines assigned to the active line, fallback to all approved machines (displaying up to 10)
  const displayMachines = useMemo(() => {
    if (lineMachines.length > 0) return lineMachines;
    return (machines || [])
      .filter((m: any) => m.approvalStatus === 'APPROVED' || m.approvalStatus === 'approved')
      .slice(0, 10);
  }, [lineMachines, machines]);

  // Machine OEE Data for the selected line
  const machineOeeData = useMemo(() => {
    if (displayMachines.length === 0) return [];
    const colors = ['#00e676', '#00f0ff', '#3b82f6', '#ec4899', '#a855f7'];
    return displayMachines.map((m: any, idx: number) => {
      const machineOee = m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0;
      return {
        name: m.name.toUpperCase(),
        oee: machineOee,
        fill: colors[idx % colors.length]
      };
    });
  }, [displayMachines]);

  const selectedMachine = useMemo(() => {
    if (!displayMachines || displayMachines.length === 0) return null;
    if (selectedMachineId) {
      const found = displayMachines.find((m: any) => m.id === selectedMachineId);
      if (found) return found;
    }
    return displayMachines[0];
  }, [displayMachines, selectedMachineId]);

  const selectedMachineTrendData = useMemo(() => {
    if (!selectedMachine) return [];
    const points = [];
    const telemetry = selectedMachine.lastPlcData;
    const baseTemp = Number(telemetry?.tags?.temperature ?? 55);
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 5 * 60000);
      const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
      const hash = (selectedMachine?.id || '').split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const randomFluctuation = Math.sin(i + hash) * 2 + Math.cos(i) * 1;
      points.push({
        time: timeStr,
        value: Math.round((baseTemp + randomFluctuation) * 10) / 10,
      });
    }
    return points;
  }, [selectedMachine]);

  const faultyMachines = useMemo(() => {
    return displayMachines.filter((m: any) => m.status === 'error' || m.status === 'lỗi');
  }, [displayMachines]);

  const activeFaultMachine = useMemo(() => {
    if (faultyMachines.length === 0) return null;
    if (selectedFaultId) {
      const found = faultyMachines.find((m: any) => m.id === selectedFaultId);
      if (found) return found;
    }
    return faultyMachines[0];
  }, [faultyMachines, selectedFaultId]);

  // Determine active line status based on its machines
  const activeLineStatus = useMemo(() => {
    if (displayMachines.length === 0) return 'OFFLINE';
    const statuses = displayMachines.map((m: any) => (m?.status || '').toLowerCase());
    if (statuses.includes('error') || statuses.includes('lỗi')) return 'ERROR';
    if (statuses.includes('running') || statuses.includes('đang chạy')) return 'RUNNING';
    if (statuses.includes('idle') || statuses.includes('chờ')) return 'STANDBY';
    return 'OFFLINE';
  }, [displayMachines]);

  const getBarColor = (val: number) => {
    if (val >= 85) return '#00e676';
    if (val >= 80) return '#00f0ff';
    return '#3b82f6';
  };

  const [wavePhase, setWavePhase] = useState(0);
  useEffect(() => {
    let lastTime = performance.now();
    let frameId: number;
    const loop = (now: number) => {
      const elapsed = now - lastTime;
      lastTime = now;
      setWavePhase(prev => (prev + (elapsed * 0.002)) % (Math.PI * 2));
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const cyanWave = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    const numPoints = 16;
    for (let i = 0; i <= numPoints; i++) {
      const x = 12 + i * (286 / numPoints);
      const normX = i / numPoints;
      const amplitude = 4 + normX * 16;
      const baseHeight = 110 - normX * 25;
      const waveVal = Math.sin(normX * 8 - wavePhase) * 0.7 + Math.sin(normX * 16 - wavePhase * 1.5) * 0.3;
      const y = baseHeight + waveVal * amplitude;
      points.push({ x, y });
    }
    const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillD = `${pathD} L 298 128 L 12 128 Z`;
    return { pathD, fillD, points };
  }, [wavePhase]);

  const pinkWave = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    const numPoints = 16;
    for (let i = 0; i <= numPoints; i++) {
      const x = 12 + i * (286 / numPoints);
      const normX = i / numPoints;
      const amplitude = 3 + normX * 12;
      const baseHeight = 105 - normX * 10;
      const waveVal = Math.sin(normX * 6 + wavePhase) * 0.75 + Math.cos(normX * 12 + wavePhase * 2) * 0.25;
      const y = baseHeight + waveVal * amplitude;
      points.push({ x, y });
    }
    const pathD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillD = `${pathD} L 298 128 L 12 128 Z`;
    return { pathD, fillD, points };
  }, [wavePhase]);

  const connections = useMemo(() => {
    if (!activeLine || !activeLine.description) return null;
    try {
      if (activeLine.description.trim().startsWith('{')) {
        const parsed = JSON.parse(activeLine.description);
        
        // Check if it's the prev/next object format: { "machineId": { "prev": ..., "next": ... } }
        const keys = Object.keys(parsed);
        if (keys.length > 0 && parsed[keys[0]] && (parsed[keys[0]].hasOwnProperty('prev') || parsed[keys[0]].hasOwnProperty('next'))) {
          const conns: Record<string, string> = {};
          keys.forEach((srcId) => {
            const nextVal = parsed[srcId]?.next;
            if (nextVal) {
              conns[srcId] = nextVal;
            }
          });
          return conns;
        }

        // Check if it's the old ReactFlow format
        if (parsed && parsed.edges && Array.isArray(parsed.edges)) {
          const conns: Record<string, string> = {};
          parsed.edges.forEach((e: any) => {
            if (conns[e.source]) {
              conns[e.source] = `${conns[e.source]},${e.target}`;
            } else {
              conns[e.source] = e.target;
            }
          });
          return conns;
        }

        return parsed;
      }
    } catch (e) {}
    return null;
  }, [activeLine]);

  const sortedGroups = useMemo(() => {
    if (displayMachines.length === 0) return [];

    // 1. Build adjacency maps
    const adj: Record<string, string[]> = {};
    const rev: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    displayMachines.forEach((m) => {
      adj[m.id] = [];
      rev[m.id] = [];
      inDegree[m.id] = 0;
    });

    const conns = connections || {};
    Object.entries(conns).forEach(([src, targetId]) => {
      if (!targetId) return;
      const targets = typeof targetId === 'string' ? targetId.split(',') : [];
      targets.forEach((dest) => {
        if (displayMachines.some(m => m.id === src) && displayMachines.some(m => m.id === dest)) {
          if (adj[src] && !adj[src].includes(dest)) {
            adj[src].push(dest);
          }
          if (rev[dest] && !rev[dest].includes(src)) {
            rev[dest].push(src);
          }
        }
      });
    });

    // Calculate actual inDegree
    Object.keys(rev).forEach((nodeId) => {
      inDegree[nodeId] = rev[nodeId].length;
    });

    // 2. Find root nodes
    const roots = displayMachines.filter((m) => inDegree[m.id] === 0);
    
    // Sort roots to make sure Screw is row 0, Jumper is row 1
    roots.sort((a, b) => {
      const aIsScrew = a.machineCode?.toLowerCase().includes('screw') || a.name?.toLowerCase().includes('screw');
      const bIsScrew = b.machineCode?.toLowerCase().includes('screw') || b.name?.toLowerCase().includes('screw');
      if (aIsScrew && !bIsScrew) return -1;
      if (!aIsScrew && bIsScrew) return 1;
      return (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0);
    });

    // 3. Calculate topological column indexes (depth) using BFS longest path
    const depth: Record<string, number> = {};
    displayMachines.forEach((m) => {
      depth[m.id] = 0;
    });

    const queue: string[] = roots.map(r => r.id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currDepth = depth[curr];
      (adj[curr] || []).forEach((next) => {
        depth[next] = Math.max(depth[next] || 0, currDepth + 1);
        queue.push(next);
      });
    }

    // 3b. Optimize columns using ALAP (As Late As Possible) shift to align nodes closer to their targets
    const colIndex: Record<string, number> = {};
    displayMachines.forEach((m) => {
      colIndex[m.id] = depth[m.id];
    });

    // Sort nodes by depth descending to calculate max shift backwards
    const descDepthNodes = [...displayMachines].sort((a, b) => depth[b.id] - depth[a.id]);
    descDepthNodes.forEach((m) => {
      const targets = adj[m.id] || [];
      if (targets.length > 0) {
        const minTargetCol = Math.min(...targets.map(tId => colIndex[tId]));
        colIndex[m.id] = minTargetCol - 1;
      }
    });

    // 4. Calculate dynamic row values topologically to sort machines within the same column
    const rowVal: Record<string, number> = {};
    roots.forEach((r, idx) => {
      rowVal[r.id] = idx;
    });

    const topoNodes = [...displayMachines].sort((a, b) => depth[a.id] - depth[b.id]);
    topoNodes.forEach((m) => {
      if (rowVal[m.id] !== undefined) return;
      const preds = rev[m.id] || [];
      if (preds.length > 0) {
        const sum = preds.reduce((acc, pId) => acc + (rowVal[pId] ?? 0), 0);
        rowVal[m.id] = sum / preds.length;
      } else {
        rowVal[m.id] = 0;
      }
    });

    // Group by colIndex
    const colMap = new Map<number, any[]>();
    displayMachines.forEach((m) => {
      const col = colIndex[m.id] ?? 0;
      if (!colMap.has(col)) {
        colMap.set(col, []);
      }
      colMap.get(col)!.push(m);
    });

    // Sort machines in each column by rowVal
    const sortedCols = Array.from(colMap.keys()).sort((a, b) => a - b);
    return sortedCols.map((col) => {
      const machines = colMap.get(col)!;
      machines.sort((a, b) => (rowVal[a.id] ?? 0) - (rowVal[b.id] ?? 0));
      return {
        sequenceOrder: col,
        machines,
      };
    });
  }, [displayMachines, connections]);

  const hasChassisBranch = useMemo(() => {
    return displayMachines.some(m => m.machineCode === 'CHASSIS-01') && 
           displayMachines.some(m => m.machineCode === 'CHASSIS-SMB-01');
  }, [displayMachines]);

  const isStandardMKZLayout = useMemo(() => {
    return false; // Force dynamic centered fallback layout
  }, []);

  const branchMachines = useMemo(() => {
    if (!hasChassisBranch) return null;
    return {
      jumper: displayMachines.find(m => m.machineCode === 'JUMPER-01'),
      mcb: displayMachines.find(m => m.machineCode === 'MCB-01'),
      smb: displayMachines.find(m => m.machineCode === 'SMB-01'),
      screw: displayMachines.find(m => m.machineCode === 'SCREW-01'),
      smb2: displayMachines.find(m => m.machineCode === 'SMB-02'),
      chassis: displayMachines.find(m => m.machineCode === 'CHASSIS-01'),
      assembly: displayMachines.find(m => m.machineCode === 'CHASSIS-SMB-01'),
    };
  }, [displayMachines, hasChassisBranch]);

  const isSmbBypassingScrew = useMemo(() => {
    if (!connections) return true; // Default layout shape matching mockup
    if (!branchMachines) return false;
    const smbId = branchMachines.smb?.id;
    const smb2Id = branchMachines.smb2?.id;
    return smbId && smb2Id && connections[smbId] === smb2Id;
  }, [connections, branchMachines]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/25 border-t-cyan-400" />
        <p className="text-sm font-bold text-cyan-400/85">{t('dashboardPage.loading')}</p>
      </div>
    );
  }

  const lineNameLabel = role === 'viewer'
    ? (activeLine?.name ?? 'Line A')
    : (activeLine ? tDynamic(activeLine?.name || '') : 'Line A');

  const footerClass = role === 'viewer' ? 'text-center shrink-0' : 'text-center';

  const renderConnectorArrow = () => (
    <div className="w-6 h-4 pointer-events-none hidden md:block z-10 text-cyan-400 shrink-0">
      <svg viewBox="0 0 40 20" className="w-full h-full">
        <path d="M 0,10 L 28,10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animated-edge-flow" />
        <polygon points="26,6 34,10 26,14" fill="currentColor" />
      </svg>
    </div>
  );

  const renderMachineCard = (machine: any, idx: number) => {
    if (!machine) return null;
    const isRunning = machine.status === 'running' || machine.status === 'đang chạy';
    const isIdle = machine.status === 'idle' || machine.status === 'chờ';
    const isError = machine.status === 'error' || machine.status === 'lỗi';
    const speed = machine.lastPlcData?.tags?.speed ?? 0;
    const prodCount = machine.lastPlcData?.productionCount ?? 0;

    const iconType = (() => {
      const n = (machine?.name || '').toLowerCase();
      if (n.includes('feed') || n.includes('nguyên liệu') || n.includes('cấp')) return 'feeding';
      if (n.includes('cut') || n.includes('cắt')) return 'cutting';
      if (n.includes('stamp') || n.includes('dập') || n.includes('đột')) return 'stamping';
      if (n.includes('weld') || n.includes('hàn')) return 'welding';
      if (n.includes('assemble') || n.includes('lắp ráp') || n.includes('lắp')) return 'assembly';
      return 'packing';
    })();

    let cardBgClass = 'bg-[#070c1e]';
    let shadowClass = '';
    let statusText = `OK: ${prodCount} ${t('dashboardPage.pcsUnit')}`;
    let statusColor = 'text-emerald-400';
    let statusBg = 'bg-emerald-500/5';
    let statusBorder = 'border-emerald-500/10';

    if (isError) {
      cardBgClass = 'bg-[#1c0f13]';
      shadowClass = 'shadow-[0_0_15px_rgba(239,68,68,0.08)]';
      statusText = t('dashboardPage.machineWarning');
      statusColor = 'text-rose-500';
      statusBg = 'bg-rose-500/5';
      statusBorder = 'border-rose-500/10';
    } else if (isIdle) {
      cardBgClass = 'bg-[#120f0a]';
      shadowClass = 'shadow-[0_0_15px_rgba(245,158,11,0.08)]';
      statusText = t('dashboardPage.machineStandby');
      statusColor = 'text-amber-400';
      statusBg = 'bg-amber-500/5';
      statusBorder = 'border-amber-500/10';
    } else if (isRunning) {
      if (role === 'viewer') {
        statusText = `OK: ${prodCount} ${t('dashboardPage.pcsUnit')}`;
      } else {
        statusText = speed > 0 ? `OK: ${Math.round(speed * 60)} ${t('dashboardPage.pcsUnit')}/h` : t('dashboardPage.machineOkActive');
      }
    } else {
      cardBgClass = 'bg-[#070c1e]/40';
      statusText = t('dashboardPage.machineOffline');
      statusColor = 'text-text-muted';
      statusBg = 'bg-[#070c1e]/30';
      statusBorder = 'border-[#14356a]/20';
    }

    let descriptiveText = statusText;
    if (!isError && !isIdle && isRunning) {
      const n = (machine?.name || '').toLowerCase();
      if (n.includes('feed') || n.includes('nguyên liệu') || n.includes('cấp')) {
        descriptiveText = t('dashboardPage.machineOkFeed');
      } else if (n.includes('cut') || n.includes('cắt')) {
        descriptiveText = t('dashboardPage.machineOkSpeed', { value: Math.round(speed * 60) || 120 });
      } else if (n.includes('stamp') || n.includes('dập') || n.includes('đột')) {
        descriptiveText = t('dashboardPage.machineOkSpeed', { value: Math.round(speed * 60) || 118 });
      } else if (n.includes('weld') || n.includes('hàn')) {
        descriptiveText = t('dashboardPage.machineOkSpeed', { value: Math.round(speed * 60) || 105 });
      } else if (n.includes('assemble') || n.includes('lắp ráp') || n.includes('lắp')) {
        descriptiveText = t('dashboardPage.machineOkSpeed', { value: Math.round(speed * 60) || 105 });
      } else {
        descriptiveText = t('dashboardPage.machineOkWarehouse');
      }
    } else if (isIdle) {
      descriptiveText = t('dashboardPage.machineStandby');
    } else if (isError) {
      descriptiveText = t('dashboardPage.machineWarningSpeed', { value: Math.round(speed * 60) || 90 });
    }

    let cardStrokeColor = 'rgba(0, 240, 255, 0.3)';
    if (isError) cardStrokeColor = 'rgba(239, 68, 68, 0.4)';
    else if (isIdle) cardStrokeColor = 'rgba(245, 158, 11, 0.4)';
    else if (machine.status === 'offline') cardStrokeColor = 'rgba(20, 53, 106, 0.4)';

    return (
      <div key={machine.id} className="w-full md:w-[120px] text-center flex flex-col items-center relative select-none z-10 shrink-0">
        <div 
          className={`w-full p-2 py-1.5 text-center flex flex-col items-center relative min-h-[92px] ${cardBgClass} ${shadowClass}`}
          style={{ clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)' }}
        >
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 80">
            <path 
              d="M 4 1.5 L 96 1.5 L 98.5 4 L 98.5 76 L 96 78.5 L 4 78.5 L 1.5 76 L 1.5 4 Z" 
              fill="none" 
              stroke={cardStrokeColor} 
              strokeWidth="1.2" 
              vectorEffect="non-scaling-stroke"
            />
            {isRunning && (
              <>
                <path d="M 1.5 12 L 1.5 4 L 4 1.5 L 12 1.5" fill="none" stroke="#00f0ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 98.5 68 L 98.5 76 L 96 78.5 L 88 78.5" fill="none" stroke="#00f0ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </>
            )}
            {isIdle && (
              <>
                <path d="M 1.5 12 L 1.5 4 L 4 1.5 L 12 1.5" fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 98.5 68 L 98.5 76 L 96 78.5 L 88 78.5" fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </>
            )}
            {isError && (
              <>
                <path d="M 1.5 12 L 1.5 4 L 4 1.5 L 12 1.5" fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                <path d="M 98.5 68 L 98.5 76 L 96 78.5 L 88 78.5" fill="none" stroke="#ef4444" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
 
          <span className="text-[9px] font-black text-cyan-400/70 tracking-wider truncate w-full z-10" title={machine.name}>
            {String(idx + 1).padStart(2, '0')} {machine.name.toUpperCase()}
          </span>
          <div className="my-1 z-10 flex items-center justify-center">
            <MachineIcon type={iconType} />
          </div>
          <span className={`inline-flex items-center gap-1 text-[8.5px] font-bold ${statusColor} ${statusBg} px-1.5 py-0.5 rounded border ${statusBorder} z-10`}>
            {descriptiveText}
          </span>
        </div>
      </div>
    );
  };

  const renderStationParameters = (machine: any) => {
    const isError = machine.status === 'error' || machine.status === 'lỗi';
    
    const telemetry = machine.lastPlcData;
    const temperature = telemetry?.temperature ?? telemetry?.tags?.temperature ?? 0;
    const pressure = telemetry?.pressure ?? telemetry?.tags?.pressure ?? 0;
    const speed = telemetry?.tags?.speed ?? 0;
    const prodQty = telemetry?.productionCount ?? telemetry?.production?.qty ?? 0;
    const uptimeSeconds = telemetry?.machineRuntimeSeconds ?? telemetry?.production?.runtime ?? 0;
    const oeeVal = telemetry?.production?.oee ?? telemetry?.tags?.oee ?? 0;

    return (
      <>
        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Nhiệt độ hoạt động</span>
          <span className={`text-lg font-black mt-1 block font-mono ${temperature > 85 ? 'text-rose-400' : 'text-cyan-400'}`}>
            {temperature > 0 ? `${temperature.toFixed(1)} °C` : 'N/A'}
          </span>
          <span className={`text-[8.5px] font-black uppercase mt-1 px-1.5 py-0.5 rounded border inline-block ${temperature > 85 ? 'text-rose-400 bg-rose-500/5 border-rose-500/10' : 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10'}`}>
            {temperature > 85 ? 'Nhiệt độ cao' : 'Ổn định'}
          </span>
        </div>
        
        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Áp suất khí nén</span>
          <span className={`text-lg font-black mt-1 block font-mono ${isError ? 'text-rose-400' : 'text-cyan-400'}`}>
            {pressure > 0 ? `${pressure.toFixed(2)} bar` : 'N/A'}
          </span>
          <span className={`text-[8.5px] font-black uppercase mt-1 px-1.5 py-0.5 rounded border inline-block ${isError ? 'text-rose-400 bg-rose-500/5 border-rose-500/10' : 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10'}`}>
            {isError ? 'Cảnh báo' : 'Bình thường'}
          </span>
        </div>

        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Tốc độ tức thời</span>
          <span className="text-lg font-black text-white mt-1 block font-mono">
            {speed > 0 ? `${speed.toFixed(1)} pcs/m` : '0 pcs/m'}
          </span>
        </div>

        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Hiệu suất hoạt động (OEE)</span>
          <span className="text-lg font-black text-white mt-1 block font-mono">
            {oeeVal > 0 ? `${oeeVal.toFixed(1)}%` : '0.0%'}
          </span>
        </div>

        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Sản lượng trong ca</span>
          <span className="text-lg font-black text-cyan-400 mt-1 block font-mono">{prodQty.toLocaleString()} pcs</span>
        </div>

        <div className="bg-[#070c1e]/60 border border-[#14356a]/30 p-3 rounded-lg">
          <span className="text-[9px] font-black text-[#55678c] uppercase tracking-wider block">Thời gian chạy máy</span>
          <span className="text-lg font-black text-white mt-1 block font-mono">
            {uptimeSeconds > 0 ? `${Math.round(uptimeSeconds / 60)} min` : '0 min'}
          </span>
        </div>
      </>
    );
  };

  const CircularProgressGauge = ({ value, label, color = '#00f0ff' }: { value: number; label: string; color?: string }) => {
    const radius = 24;
    const strokeWidth = 3;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (value / 100) * circumference;

    return (
      <div className="flex flex-col items-center p-3 bg-[#070c1e]/60 border border-cyan-500/10 rounded-lg relative overflow-hidden select-none flex-1 min-w-[100px]">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 60 60" className="w-full h-full transform -rotate-90">
            {/* Background circle */}
            <circle cx="30" cy="30" r={radius} fill="none" stroke="#0a1a35" strokeWidth={strokeWidth} />
            {/* Active progress arc */}
            <circle 
              cx="30" 
              cy="30" 
              r={radius} 
              fill="none" 
              stroke={color} 
              strokeWidth={strokeWidth} 
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-black text-white font-mono">
            {value}%
          </div>
        </div>
        <span className="text-[9px] font-black text-slate-400 uppercase mt-2 text-center tracking-wider w-full truncate" title={label}>{label}</span>
        <span className="text-[8px] font-black text-emerald-400 uppercase mt-0.5">ỔN ĐỊNH</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 text-white bg-transparent flex-1 h-full min-h-0 xl:overflow-hidden select-none">
      {/* Top Header Bar */}
      {/* Top Header Bar */}
      {hideBottomCharts ? (
        <div 
          className="relative overflow-hidden bg-[#0A1129]/80 px-4 py-2 border border-cyan-500/25 flex items-center justify-between shrink-0 shadow-[0_4px_15px_rgba(0,240,255,0.03)]"
          style={{ clipPath: 'polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)' }}
        >
          {/* Left: Dropdown select line */}
          <div className="flex items-center gap-2.5 z-10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('common.selectLine', 'Dây chuyền')}:</span>
            <div className="relative">
              <select
                value={selectedLineId || ''}
                onChange={(e) => setSelectedLineId(e.target.value)}
                className="appearance-none bg-[#0a1435]/90 border border-cyan-500/40 text-cyan-400 text-[10px] font-black uppercase px-3 py-1 pr-8 rounded focus:outline-none focus:border-cyan-400 cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.05)] hover:bg-cyan-500/5 transition-all"
              >
                {lines?.map((l: any) => (
                  <option key={l.id} value={l.id} className="bg-[#070c1e] text-cyan-400 uppercase">
                    {l.name.toUpperCase()}
                  </option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400/70 text-[8px]">
                ▼
              </div>
            </div>
          </div>

          {/* Center: Line Name */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h2 className="text-xs sm:text-sm font-black text-cyan-400 uppercase tracking-widest select-none z-10 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
              DÂY CHUYỀN SẢN XUẤT - {lineNameLabel.toUpperCase()}
            </h2>
          </div>

          {/* Right: Realtime Clock & Telemetry Status */}
          <div className="flex items-center gap-4 z-10 text-[10px] font-mono font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              TELEMETRY LIVE
            </span>
            <span className="text-cyan-400 font-black">{currentTime.toLocaleTimeString()}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between shrink-0 pb-1 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {/* Diamond Grid Icon */}
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              <h1 className="text-xs sm:text-sm font-black uppercase tracking-widest text-white">
                {t('dashboardPage.overviewTitle', '生产总览')}
              </h1>
            </div>

            {/* Dropdown select line */}
            <div className="flex items-center gap-2 z-10 border-l border-white/10 pl-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('common.selectLine', 'Dây chuyền')}:</span>
              <div className="relative">
                <select
                  value={selectedLineId || ''}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                  className="appearance-none bg-[#0a1435]/90 border border-cyan-500/40 text-cyan-400 text-[10px] font-black uppercase px-3 py-1 pr-8 rounded focus:outline-none focus:border-cyan-400 cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.05)] hover:bg-cyan-500/5 transition-all"
                >
                  {lines?.map((l: any) => (
                    <option key={l.id} value={l.id} className="bg-[#070c1e] text-cyan-400 uppercase">
                      {l.name.toUpperCase()}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400/70 text-[8px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] font-mono font-bold text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('dashboardPage.realtimeUpdate', '实时更新')} · {currentTime.getFullYear()}-{String(currentTime.getMonth() + 1).padStart(2, '0')}-{String(currentTime.getDate()).padStart(2, '0')} {currentTime.toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* Main Grid */}
      {!hideBottomCharts ? (
        <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-hidden">
          
          {/* Row 1: Top 4 Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">

            {/* Card 1: Sản lượng hôm nay */}
            <PremiumFuturisticCard
              themeColor="#00f0ff"
              glowGradId="cyber-border-glow-cyan"
            >
              <div className="flex flex-col h-full justify-between relative z-10 select-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboardPage.kpiOutputTitle', 'SẢN LƯỢNG HÔM NAY')}</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[26px] font-black text-cyan-400 font-mono tracking-tight">{(aggregateMetrics?.output ?? 0).toLocaleString()}</span>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{t('dashboardPage.pcsUnit', 'sản phẩm')}</span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-black text-emerald-400/50 mt-1">
                  <span className="text-slate-500 font-semibold">{t('dashboardPage.realtimeUpdate', 'Cập nhật trực tiếp')}</span>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none overflow-hidden">
                <style>{`
                  @keyframes wave-scroll {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-150px); }
                  }
                `}</style>
                <svg className="w-full h-full text-cyan-400" viewBox="0 0 300 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark-fill-cyan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <g style={{ animation: 'wave-scroll 8s linear infinite' }}>
                    <path
                      d="M 0 35 Q 37.5 15 75 35 T 150 35 T 225 35 T 300 35 T 375 35 T 450 35 T 525 35 T 600 35"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d="M 0 35 Q 37.5 15 75 35 T 150 35 T 225 35 T 300 35 T 375 35 T 450 35 T 525 35 T 600 35 L 600 50 L 0 50 Z"
                      fill="url(#spark-fill-cyan)"
                    />
                    <circle cx="37.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="112.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="187.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="262.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="337.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="412.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="487.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="562.5" cy="45" r="2" fill="currentColor" />
                  </g>
                </svg>
              </div>
            </PremiumFuturisticCard>

            {/* Card 2: Hiệu suất trung bình (OEE) */}
            <PremiumFuturisticCard
              themeColor="#10b981"
              glowGradId="cyber-border-glow-green"
            >
              <div className="flex items-center justify-between h-full w-full relative z-10 select-none">
                <div className="flex flex-col h-full justify-between">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboardPage.kpiOeeTitle', 'HIỆU SUẤT TRUNG BÌNH (OEE)')}</span>
                    <div className="text-[26px] font-black text-emerald-400 font-mono tracking-tight mt-1">
                      {(aggregateMetrics?.oee ?? 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[9px] font-black text-[#10b981]/50 mt-2">
                    <span className="text-slate-500 font-semibold">{t('dashboardPage.realtimeUpdate', 'Cập nhật trực tiếp')}</span>
                  </div>
                </div>

                <div className="w-14 h-14 shrink-0 relative flex items-center justify-center mr-1">
                  <svg className="w-full h-full transform -rotate-90 text-emerald-500" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="24" fill="none" stroke="#102a45" strokeWidth="5" />
                    <circle
                      cx="32"
                      cy="32"
                      r="24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="6"
                      strokeDasharray="151"
                      strokeDashoffset={151 - (151 * (aggregateMetrics?.oee ?? 0)) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute text-[10px] font-black text-white font-mono">
                    {(aggregateMetrics?.oee ?? 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            </PremiumFuturisticCard>

            {/* Card 3: Thiết bị hoạt động */}
            <PremiumFuturisticCard
              themeColor="#00f0ff"
              glowGradId="cyber-border-glow-blue"
            >
              <div className="flex flex-col h-full justify-between relative z-10 select-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboardPage.kpiActiveDevices', 'THIẾT BỊ HOẠT ĐỘNG')}</span>
                </div>
                <div className="flex flex-col mt-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[26px] font-black text-white font-mono tracking-tight">
                      {displayMachines.filter((m: any) => m.status === 'running' || m.status === 'đang chạy').length}
                    </span>
                    <span className="text-sm font-bold text-slate-500 font-mono">/ {displayMachines.length}</span>
                  </div>
                  <div className="text-[9.5px] font-black text-cyan-400 font-mono">
                    {Math.round((displayMachines.filter((m: any) => m.status === 'running' || m.status === 'đang chạy').length / (displayMachines.length || 1)) * 100)}%
                  </div>
                </div>
                
                <div className="flex gap-1 mt-2 h-2.5 w-full bg-slate-950/40 p-0.5 rounded border border-cyan-500/10">
                  {Array.from({ length: 15 }).map((_, i) => {
                    const ratio = displayMachines.filter((m: any) => m.status === 'running' || m.status === 'đang chạy').length / (displayMachines.length || 1);
                    const activeCount = Math.round(ratio * 15);
                    const isActive = i < activeCount;
                    return (
                      <div
                        key={i}
                        className={`flex-1 h-full rounded-sm transition-all duration-300 ${
                          isActive 
                            ? 'bg-cyan-400 shadow-[0_0_5px_rgba(0,240,255,0.8)]' 
                            : 'bg-slate-800/60'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>
            </PremiumFuturisticCard>

            {/* Card 4: Tỷ lệ phế phẩm */}
            <PremiumFuturisticCard
              themeColor="#f43f5e"
              glowGradId="cyber-border-glow-pink"
            >
              <div className="flex flex-col h-full justify-between relative z-10 select-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('dashboardPage.kpiScrapRate', 'TỶ LỆ PHẾ PHẨM')}</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[26px] font-black text-rose-500 font-mono tracking-tight">
                    {(aggregateMetrics?.scrapRate ?? 0).toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[9px] font-black text-rose-500/50 mt-1">
                  <span className="text-slate-500 font-semibold">{t('dashboardPage.realtimeUpdate', 'Cập nhật trực tiếp')}</span>
                </div>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none overflow-hidden">
                <svg className="w-full h-full text-rose-500" viewBox="0 0 300 50" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="spark-fill-pink" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <g style={{ animation: 'wave-scroll 8s linear infinite' }}>
                    <path
                      d="M 0 35 Q 37.5 55 75 35 T 150 35 T 225 35 T 300 35 T 375 35 T 450 35 T 525 35 T 600 35"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d="M 0 35 Q 37.5 55 75 35 T 150 35 T 225 35 T 300 35 T 375 35 T 450 35 T 525 35 T 600 35 L 600 50 L 0 50 Z"
                      fill="url(#spark-fill-pink)"
                    />
                    <circle cx="37.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="112.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="187.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="262.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="337.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="412.5" cy="25" r="2" fill="currentColor" />
                    <circle cx="487.5" cy="45" r="2" fill="currentColor" />
                    <circle cx="562.5" cy="25" r="2" fill="currentColor" />
                  </g>
                </svg>
              </div>
            </PremiumFuturisticCard>

          </div>
          

          {/* Row 2: Production Line Flowchart (Sơ đồ dây chuyền sản xuất) */}
          <div 
            className="relative overflow-hidden bg-[#0A1129]/80 p-5 px-6 border border-cyan-500/25 flex flex-col justify-between gap-4 shadow-[0_4px_15px_rgba(0,240,255,0.02)] rounded-xl min-h-[360px] shrink-0"
            style={{ clipPath: 'polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)' }}
          >
            {/* 4 Absolute-positioned, non-stretching corner SVGs containing the glowing blurred corner blocks */}
            {/* Top-Left Corner */}
            <svg className="absolute top-0 left-0 w-8 h-8 pointer-events-none text-cyan-400" viewBox="0 0 32 32">
              <path d="M 2 16 L 2 10 L 10 2 L 16 2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M 5 16 L 5 12 L 12 5 L 16 5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
              <polygon 
                points="2,8 8,2 10,4 4,10" 
                fill="currentColor" 
                className="animate-pulse" 
                style={{ filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.75))', fillOpacity: 0.85 }} 
              />
            </svg>
            {/* Top-Right Corner */}
            <svg className="absolute top-0 right-0 w-8 h-8 pointer-events-none text-cyan-400" viewBox="0 0 32 32">
              <path d="M 30 16 L 30 10 L 22 2 L 16 2" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M 27 16 L 27 12 L 20 5 L 16 5" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
              <polygon 
                points="30,8 24,2 22,4 28,10" 
                fill="currentColor" 
                className="animate-pulse" 
                style={{ filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.75))', fillOpacity: 0.85 }} 
              />
            </svg>
            {/* Bottom-Left Corner */}
            <svg className="absolute bottom-0 left-0 w-8 h-8 pointer-events-none text-cyan-400" viewBox="0 0 32 32">
              <path d="M 2 16 L 2 22 L 10 30 L 16 30" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M 5 16 L 5 20 L 12 27 L 16 27" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
              <polygon 
                points="2,24 8,30 10,28 4,22" 
                fill="currentColor" 
                className="animate-pulse" 
                style={{ filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.75))', fillOpacity: 0.85 }} 
              />
            </svg>
            {/* Bottom-Right Corner */}
            <svg className="absolute bottom-0 right-0 w-8 h-8 pointer-events-none text-cyan-400" viewBox="0 0 32 32">
              <path d="M 30 16 L 30 22 L 22 30 L 16 30" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M 27 16 L 27 20 L 20 27 L 16 27" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
              <polygon 
                points="30,24 24,30 22,28 28,22" 
                fill="currentColor" 
                className="animate-pulse" 
                style={{ filter: 'drop-shadow(0 0 3px rgba(0,240,255,0.75))', fillOpacity: 0.85 }} 
              />
            </svg>

            <div className="flex items-center justify-between border-b border-[#00f0ff]/20 pb-2 shrink-0 z-10">
              <div className="flex items-center gap-0">
                {/* Slanted Title Badge */}
                <div 
                  className="bg-cyan-950/40 border border-cyan-500/35 px-4 pr-7 py-1 text-cyan-400 relative flex items-center gap-2 shadow-[inset_0_0_8px_rgba(0,240,255,0.1)]"
                  style={{ clipPath: 'polygon(10px 0, 100% 0, calc(100% - 15px) 100%, 0 100%, 0 10px)' }}
                >
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                  <h3 className="text-[11px] font-black uppercase tracking-widest leading-none mt-0.5 select-none">
                    {t('dashboardPage.flowchartTitle', 'SƠ ĐỒ DÂY CHUYỀN SẢN XUẤT')}
                  </h3>
                </div>
                {/* Tech Hatch Lines */}
                <svg className="h-5 w-20 text-cyan-500/25 shrink-0 select-none -ml-2" viewBox="0 0 80 20">
                  <line x1="10" y1="20" x2="22" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="16" y1="20" x2="28" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="22" y1="20" x2="34" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="28" y1="20" x2="40" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="34" y1="20" x2="46" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="40" y1="20" x2="52" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="46" y1="20" x2="58" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="52" y1="20" x2="64" y2="0" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="58" y1="20" x2="70" y2="0" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </div>

              {/* Cyberpunk Status Panel */}
              <div className="flex items-center gap-2 text-[10px] font-black text-cyan-400/80 font-sans z-10 bg-cyan-950/20 px-3 py-1 rounded border border-cyan-500/20 shadow-[0_0_8px_rgba(0,240,255,0.05)]">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>{t('dashboardPage.flowchartState', 'TRẠNG THÁI VẬN HÀNH DÂY CHUYỀN')}: </span>
                <span className="text-emerald-400 font-mono">
                  {activeLineStatus === 'RUNNING' ? t('dashboardPage.statusActive', 'ĐANG HOẠT ĐỘNG') :
                   activeLineStatus === 'ERROR' ? t('dashboardPage.statusError', 'GẶP SỰ CỐ') :
                   activeLineStatus === 'STANDBY' ? t('dashboardPage.statusStandby', 'CHỜ STANDBY') :
                   t('dashboardPage.statusOffline', 'MẤT KẾT NỐI')}
                </span>
              </div>
            </div>

            {/* Hex-clipped horizontal station strip wrapper */}
            <div 
              className={'w-full flex-1 flex items-center justify-between p-4 my-1.5 relative bg-[#070c1e]/40 border-y border-cyan-500/10 ' + (hasChassisBranch ? 'min-h-[252px]' : 'min-h-[140px]') + ' overflow-hidden z-10'}
              style={{ clipPath: 'polygon(15px 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 15px 100%, 0 50%)' }}
            >
              {/* Horizontal Station Pipeline scroll container */}
              <div className={'flex flex-col md:flex-row gap-4 items-center ' + (hasChassisBranch ? 'justify-center md:justify-between' : 'justify-between') + ' w-full z-10 px-8 overflow-x-auto overflow-y-hidden min-h-0'}>
                {displayMachines.length === 0 ? (
                  <div className="text-center w-full py-6 text-sm font-bold text-text-secondary select-none">
                    {t('dashboardPage.emptyLine', 'Không có trạm máy nào được gán cho dây chuyền này')}
                  </div>
                                ) : isStandardMKZLayout && branchMachines ? (
                  <div className="flex-1 flex flex-col md:flex-row items-center justify-between w-full h-[218px] z-10 px-4 relative">
                    {/* Background SVG connections overlay */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none text-cyan-500/40 hidden md:block" viewBox="0 0 920 260" preserveAspectRatio="none">
                      <defs>
                        <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="currentColor" />
                        </marker>
                      </defs>

                      {/* Path 1: Jumper -> MCB */}
                      <path d="M 140,130 L 168,130" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />

                      {/* Path 2: MCB -> SMB */}
                      <path d="M 290,130 L 318,130" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />

                      {/* Path 3: SMB -> Next (either Screw or SMB 2) */}
                      {isSmbBypassingScrew ? (
                        <path d="M 440,130 L 454,130 L 454,205 L 618,205" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />
                      ) : (
                        <path d="M 440,130 L 468,130" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />
                      )}

                      {/* Path 4: Screw -> SMB 2 */}
                      {isSmbBypassingScrew ? null : (
                        <path d="M 590,130 L 604,130 L 604,205 L 618,205" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />
                      )}

                      {/* Path 5: Chassis has no path following it */}

                      {/* Path 6: SMB 2 -> Assembly */}
                      <path d="M 740,205 L 755,205 L 755,130 L 768,130" stroke="currentColor" strokeWidth="2.5" strokeDasharray="5 5" fill="none" className="animated-edge-flow" markerEnd="url(#arrow)" />
                    </svg>

                    {/* Column 1: Jumper */}
                    <div className="flex flex-col justify-center h-full min-w-[120px] self-center">
                      {renderMachineCard(branchMachines.jumper, 0)}
                    </div>

                    {/* Space for arrow */}
                    <div className="w-8 h-4 hidden md:block shrink-0" />

                    {/* Column 2: MCB */}
                    <div className="flex flex-col justify-center h-full min-w-[120px] self-center">
                      {renderMachineCard(branchMachines.mcb, 1)}
                    </div>

                    {/* Space for arrow */}
                    <div className="w-8 h-4 hidden md:block shrink-0" />

                    {/* Column 3: SMB */}
                    <div className="flex flex-col justify-center h-full min-w-[120px] self-center">
                      {renderMachineCard(branchMachines.smb, 2)}
                    </div>

                    {/* Space for arrow */}
                    <div className="w-8 h-4 hidden md:block shrink-0" />

                    {/* Column 4: Screw */}
                    {isSmbBypassingScrew ? (
                      <div className="flex flex-col justify-end h-full min-w-[120px] self-center pb-1">
                        <div className="h-20 hidden md:block" />
                        {renderMachineCard(branchMachines.screw, 3)}
                      </div>
                    ) : (
                      <div className="flex flex-col justify-center h-full min-w-[120px] self-center">
                        {renderMachineCard(branchMachines.screw, 3)}
                      </div>
                    )}

                    {/* Space for arrow */}
                    <div className="w-8 h-4 hidden md:block shrink-0" />

                    {/* Column 5: Fork Stack */}
                    <div className="flex flex-col gap-2.5 justify-between h-full min-w-[120px] py-1 self-center">
                      {/* Chassis (Top) */}
                      {renderMachineCard(branchMachines.chassis, 5)}
                      {/* SMB 2 (Bottom) */}
                      {renderMachineCard(branchMachines.smb2, 4)}
                    </div>

                    {/* Space for arrow */}
                    <div className="w-8 h-4 hidden md:block shrink-0" />

                    {/* Column 6: Assembly */}
                    <div className="flex flex-col justify-center h-full min-w-[120px] self-center">
                      {renderMachineCard(branchMachines.assembly, 6)}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-6 md:gap-10 overflow-x-auto py-2 w-full min-h-[218px]">
                    {(() => {
                      let globalIdx = 0;
                      return sortedGroups.map((group, colIdx) => (
                        <Fragment key={group.sequenceOrder}>
                          {colIdx > 0 && (
                            <div className="flex items-center text-cyan-500/40 shrink-0">
                              <svg viewBox="0 0 40 20" className="w-8 h-4">
                                <path d="M 0,10 L 28,10" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="animated-edge-flow" />
                                <polygon points="26,6 34,10 26,14" fill="currentColor" />
                              </svg>
                            </div>
                          )}
                          <div className="flex flex-col gap-3 justify-center py-1">
                            {group.machines.map((m, rowIdx) => {
                              const idx = globalIdx++;
                              return (
                                <Fragment key={m.id}>
                                  {renderMachineCard(m, idx)}
                                </Fragment>
                              );
                            })}
                          </div>
                        </Fragment>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Status bar */}
            <div className="flex items-center gap-6 text-[10px] font-bold border-t border-[#14356a]/40 pt-2.5 z-10">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t('dashboardPage.runningCount', 'VẬN HÀNH')} ({displayMachines.filter(m => m.status === 'running').length})
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {t('dashboardPage.warningCount', 'CHỜ STANDBY')} ({displayMachines.filter(m => m.status === 'idle').length})
              </span>
              <span className="flex items-center gap-1.5 text-rose-500">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                {t('dashboardPage.faultCount', 'GẶP SỰ CỐ')} ({displayMachines.filter(m => m.status === 'error').length})
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                {t('dashboardPage.stopCount', 'MẤT KẾT NỐI')} ({displayMachines.filter(m => m.status === 'offline').length})
              </span>
            </div>
          </div>
          {/* Row 3: Bottom Panels (Recent Events + Shift Team On Duty) */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0 overflow-hidden">
            {/* Left Panel: Recent Events (近期事件) */}
            <FuturisticCard
              themeColor="#3b82f6"
              glowGradId="cyber-border-glow-row3-left"
              className="xl:col-span-3"
            >
              {/* Header */}
              <div className="flex items-center gap-2 border-b border-[#14356a]/40 pb-2.5 shrink-0">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">
                  {t('dashboardPage.recentEventsTitle', '近期事件')}
                </h3>
              </div>

              {/* Event List */}
              <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 min-h-0">
                {data?.recentAlarms && data.recentAlarms.length > 0 ? (
                  data.recentAlarms.map((alarm: any) => {
                    const time = alarm.createdAt ? new Date(alarm.createdAt) : null;
                    const timeStr = time ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}` : '';
                    
                    const isCritical = alarm.severity === 'CRITICAL' || alarm.severity === 'critical';
                    const isWarning = alarm.severity === 'WARNING' || alarm.severity === 'warning';
                    
                    let iconColor = 'text-cyan-400';
                    let iconBg = 'bg-cyan-500/10';
                    let iconBorder = 'border-cyan-500/30';
                    let titleColor = 'text-cyan-400';
                    
                    let iconSvg = (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    );
                    
                    if (isCritical) {
                      iconColor = 'text-rose-500';
                      iconBg = 'bg-rose-500/10';
                      iconBorder = 'border-rose-500/30';
                      titleColor = 'text-rose-400';
                      iconSvg = (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      );
                    } else if (isWarning) {
                      iconColor = 'text-amber-400';
                      iconBg = 'bg-amber-500/10';
                      iconBorder = 'border-amber-500/30';
                      titleColor = 'text-amber-400';
                      iconSvg = (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      );
                    }
                    
                    return (
                      <div key={alarm.id} className="flex items-start justify-between gap-3 text-[11px] font-sans">
                        <div className="flex items-start gap-2.5">
                          <div className={`relative flex items-center justify-center shrink-0 w-6 h-6 rounded-full ${iconBg} ${iconBorder} ${iconColor}`}>
                            {iconSvg}
                          </div>
                          <div className="space-y-0.5 text-left">
                            <h4 className={`font-black ${titleColor}`}>
                              {alarm.machineName} — {alarm.severity}
                            </h4>
                            <p className="text-slate-400 font-medium">
                              {alarm.message}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">{timeStr}</span>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500 font-bold text-center">
                    <svg className="w-8 h-8 text-slate-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[11px] uppercase tracking-wider">{t('dashboardPage.noAlarms', 'Không có sự cố gần đây')}</p>
                  </div>
                )}
              </div>

              {/* Scroll Down Button */}
              <div className="flex justify-center pt-2 shrink-0 border-t border-[#14356a]/30">
                <button className="flex items-center justify-center w-7 h-7 rounded-full bg-[#0a1435]/90 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-400 transition-all duration-150 active:scale-95">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </FuturisticCard>

            {/* Right Panel: Machine UPH Speeds (Tốc độ UPH từng máy) */}
            <FuturisticCard
              themeColor="#3b82f6"
              glowGradId="cyber-border-glow-row3-right"
              className="xl:col-span-1"
            >
              <div className="flex flex-col h-full justify-between min-h-0 w-full select-none">
                {/* Header */}
                <div className="flex items-center gap-2 border-b border-[#14356a]/40 pb-2.5 shrink-0">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">
                    {t('dashboardPage.machineUphTitle', 'TỐC ĐỘ UPH CỦA TỪNG MÁY')}
                  </h3>
                </div>

                {/* Columns label */}
                <div className="flex justify-between items-center text-[9px] text-slate-500 font-black uppercase tracking-widest mt-3 mb-1.5 px-1 shrink-0">
                  <span>{t('dashboardPage.deviceLabel', 'Thiết bị')}</span>
                  <span>UPH</span>
                </div>

                {/* Machine list with scrolling UPH */}
                <div className="space-y-3.5 text-[11px] font-bold overflow-y-auto pr-1 flex-1 min-h-0">
                  {displayMachines.map((m: any, mIdx: number) => {
                    const isRunning = m.status === 'running' || m.status === 'đang chạy';
                    const isIdle = m.status === 'idle' || m.status === 'chờ';
                    const isError = m.status === 'error' || m.status === 'lỗi';
                    const isOffline = m.status === 'offline';

                    const uph = m.lastPlcData?.production?.uph ?? m.lastPlcData?.tags?.uph ?? 0;
                    const progressPct = Math.min((uph / 120) * 100, 100);
                    
                    let barColor = 'from-cyan-500 to-blue-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]';
                    let valColor = 'text-cyan-400';
                    if (isIdle) {
                      barColor = 'from-amber-500 to-amber-600 shadow-[0_0_4px_rgba(245,158,11,0.4)]';
                      valColor = 'text-amber-400';
                    } else if (isError || isOffline) {
                      barColor = 'from-slate-700 to-slate-800';
                      valColor = 'text-slate-500';
                    }

                    return (
                      <div key={m.id} className="flex flex-col gap-1 px-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-300 font-black uppercase tracking-wider">
                            S{String(mIdx + 1).padStart(2, '0')} — {m.name.toUpperCase()}
                          </span>
                          <span className={valColor + ' font-mono font-black'}>{uph} UPH</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-900/60 rounded-full border border-white/5 overflow-hidden">
                          <div 
                            className={'h-full rounded-full bg-gradient-to-r ' + barColor + ' transition-all duration-500'} 
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </FuturisticCard>
          </div>
        </div>
  ) : (
    /* Station-centric Layout for Line Details in Viewer Mode */
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0 overflow-hidden text-white select-none">
      {/* Left Column: Station List (工站列表) */}
      <div className="xl:col-span-1 bg-[#0A1129]/80 border border-cyan-500/25 p-4 flex flex-col min-h-0 justify-between rounded-xl relative overflow-hidden shadow-[0_4px_15px_rgba(0,240,255,0.02)]">
        <div className="flex items-center gap-2 border-b border-[#00f0ff]/20 pb-3 mb-3 shrink-0">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">
            {t('dashboardPage.stationListTitle', 'Danh sách trạm máy')}
          </h3>
        </div>
        
        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
          {displayMachines.map((m: any, idx: number) => {
            const isSelected = selectedMachine?.id === m.id;
            const isRunning = m.status === 'running' || m.status === 'đang chạy';
            const isIdle = m.status === 'idle' || m.status === 'chờ';
            const isError = m.status === 'error' || m.status === 'lỗi';

            let statusLabel = 'Đang chạy';
            let statusColorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
            if (isError) {
              statusLabel = 'Sự cố';
              statusColorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/20';
            } else if (isIdle) {
              statusLabel = 'Chờ';
              statusColorClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
            } else if (m.status === 'offline') {
              statusLabel = 'Ngoại tuyến';
              statusColorClass = 'text-slate-400 bg-slate-500/10 border-slate-500/20';
            }

            return (
              <div
                key={m.id}
                onClick={() => setSelectedMachineId(m.id)}
                className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 flex items-center justify-between gap-3 ${
                  isSelected 
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-[0_0_12px_rgba(0,240,255,0.15)]' 
                    : 'border-[#14356a]/40 bg-[#070c1e]/50 hover:border-cyan-500/40 hover:bg-[#070c1e]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-[11px] font-black text-white tracking-wide truncate">
                    S{String(idx + 1).padStart(2, '0')} — {m.name.toUpperCase()}
                  </h4>
                  <p className="text-[8.5px] font-semibold text-slate-400 mt-1 uppercase">
                    {m.clientName || 'Trạm sản xuất'}
                  </p>
                </div>
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border shrink-0 ${statusColorClass}`}>
                  {statusLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Area (Center-Right): Selected Station telemetry + Fault Details + KPIs */}
      <div className="xl:col-span-3 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
        
        {/* Row 1: Real-time Telemetry parameters (Thông số thời gian thực) */}
        {selectedMachine && (
          <div 
            className="relative overflow-hidden bg-[#0A1129]/80 p-5 shadow-[0_4px_15px_rgba(0,240,255,0.03)] flex flex-col min-h-0 justify-between gap-3 rounded-xl border border-cyan-500/20"
          >
            <div className="flex items-center justify-between border-b border-cyan-500/15 pb-2.5 mb-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">
                  S{String(displayMachines.findIndex(m => m.id === selectedMachine.id) + 1).padStart(2, '0')} — {selectedMachine.name.toUpperCase()} — THÔNG SỐ THỜI GIAN THỰC
                </h3>
              </div>
              <span className="text-[9px] font-black text-slate-400 font-mono">PLC ACTIVE: {selectedMachine.clientId}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
              {/* Left Parameter fields (2 cols) */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {renderStationParameters(selectedMachine)}
              </div>

              {/* Right Trend Chart (1 col) */}
              <div className="flex flex-col justify-between border border-[#14356a]/40 bg-[#070c1e]/60 p-3 rounded-lg h-full min-h-[160px] overflow-hidden">
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest block mb-2">
                  XU HƯỚNG {(selectedMachine?.name || '').toLowerCase().includes('screw') || (selectedMachine?.name || '').toLowerCase().includes('vít') ? 'MÔ-MEN (30 MIN)' : 'LỰC ÉP (30 MIN)'}
                </span>
                <div className="flex-1 min-h-0 text-[8px] font-mono font-bold">
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={selectedMachineTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="miniAreaColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 2" stroke="#112240" vertical={false} />
                      <XAxis dataKey="time" stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} />
                      <YAxis stroke="#55678c" strokeWidth={0.5} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                      <Area type="monotone" dataKey="value" stroke="#00f0ff" strokeWidth={1.5} fillOpacity={1} fill="url(#miniAreaColor)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Danh sách lỗi & Chi tiết sự cố */}
        <div 
          className={`relative overflow-hidden p-5 shadow-[0_4px_15px_rgba(0,0,0,0.3)] rounded-xl border flex flex-col justify-between gap-4 select-none ${
            faultyMachines.length > 0 
              ? 'bg-[#241212]/90 border-rose-500/25 shadow-[0_4px_15px_rgba(239,68,68,0.05)] text-white' 
              : 'bg-[#0A1129]/80 border-emerald-500/20 shadow-[0_4px_15px_rgba(16,185,129,0.02)] text-white'
          }`}
        >
          {/* Header block */}
          <div className={`flex items-center justify-between border-b pb-2.5 shrink-0 ${
            faultyMachines.length > 0 ? 'border-rose-500/20 text-rose-400' : 'border-emerald-500/20 text-emerald-400'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${
                faultyMachines.length > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500 animate-ping'
              }`} />
              <h3 className="text-xs font-black uppercase tracking-wider">
                {t('dashboardPage.faultsPanelTitle', 'Danh sách sự cố & cảnh báo')}
              </h3>
            </div>
            <span className="text-[9px] font-black font-mono">
              ACTIVE FAULTS: {faultyMachines.length}
            </span>
          </div>

          {faultyMachines.length === 0 ? (
            /* Safe state: System operating normally */
            <div className="flex flex-col items-center justify-center py-4 text-center gap-2.5">
              <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <svg className="w-5 h-5 text-emerald-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-[10.5px] font-black uppercase text-emerald-400 tracking-wider">
                  HỆ THỐNG VẬN HÀNH BÌNH THƯỜNG
                </p>
                <p className="text-[9px] font-bold text-slate-400">
                  Tất cả các trạm máy trên chuyền đều hoạt động tốt, không phát hiện sự cố.
                </p>
              </div>
            </div>
          ) : (
            /* Active state: List of faults + Selected fault details */
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              
              {/* Fault Selection List */}
              <div className="flex flex-wrap gap-2 pb-2 border-b border-rose-500/10">
                {faultyMachines.map((m) => {
                  const mIdx = displayMachines.findIndex((dm) => dm.id === m.id);
                  const isSelected = activeFaultMachine?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedFaultId(m.id)}
                      className={`px-3 py-1 rounded text-[9.5px] font-black uppercase border transition-all duration-150 flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-rose-500/20 border-rose-500 text-rose-200 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                          : 'bg-[#1a0a0a]/50 border-rose-950 text-rose-400/70 hover:border-rose-800 hover:text-rose-400'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      S${String(mIdx + 1).padStart(2, '0')} — ${m.name.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              {/* Fault Details Grid */}
              {activeFaultMachine && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-[11px] font-medium text-slate-300 font-sans">
                  {/* Left Column */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">故障代码 (Mã lỗi)</span>
                      <span className="font-black text-rose-500 font-mono">ERR-T03 扭矩超限</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">实测扭矩 (Lực xoắn thực tế)</span>
                      <span className="font-black text-rose-500 font-mono">3.8 N·m</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">设定上限 (Giới hạn thiết lập)</span>
                      <span className="font-black text-white font-mono">3.2 N·m</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">触发时刻 (Thời điểm xảy ra)</span>
                      <span className="font-black text-white font-mono">14:28:05</span>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">停机时长 (Thời gian dừng máy)</span>
                      <span className="font-black text-rose-500 font-mono">00:04:02</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">影响产量 (Ảnh hưởng sản lượng)</span>
                      <span className="font-black text-rose-500">约 -11 件</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-400">维保状态 (Trạng thái sửa chữa)</span>
                      <span className="px-2.5 py-0.5 rounded text-[9.5px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                        赶赴中
                      </span>
                    </div>
                    {/* Spacer block to keep symmetry */}
                    <div className="h-[21px]" />
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
        {/* Row 3: Key Line Indicators (Chỉ số hiệu suất dây chuyền) */}
        <div className="bg-[#0A1129]/80 border border-cyan-500/20 p-4 rounded-xl flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-2 border-b border-[#00f0ff]/15 pb-2 mb-1 shrink-0">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400">
              {t('dashboardPage.kpiTitle', 'Chỉ số hiệu suất dây chuyền')}
            </h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <CircularProgressGauge value={dynamicKpis.availability} label="Độ khả dụng" color="#00e676" />
            <CircularProgressGauge value={dynamicKpis.performance} label="Hiệu suất vận hành" color="#00f0ff" />
            <CircularProgressGauge value={dynamicKpis.quality} label="Tỷ lệ chất lượng" color="#a855f7" />
            <CircularProgressGauge value={dynamicKpis.oee} label="OEE tổng hợp" color="#ec4899" />
          </div>
        </div>

      </div>
    </div>
  )}
</div>
  );
};

export default SharedDashboardPage;
