import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  BarChart2,
  CalendarDays,
  CheckCircle2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../shared/services/apiClient';
import './production-analysis-page.css';

type PanelTone = 'red' | 'amber' | 'green';

interface ReportChartPoint {
  hour: string;
  output: number;
  target?: number;
}

interface AnalysisReportsData {
  chartData?: ReportChartPoint[];
  summary?: {
    totalScrap?: number;
  };
}

interface AnalysisMachine {
  name: string;
  approvalStatus?: string;
  status?: string;
  lastPlcData?: {
    production?: {
      oee?: number;
    };
    tags?: {
      oee?: number;
    };
  };
}

interface AnalysisPanelProps {
  title: string;
  icon: LucideIcon;
  tone?: PanelTone;
  className?: string;
  children: ReactNode;
}

function AnalysisPanel({
  title,
  icon: Icon,
  tone = 'red',
  className = '',
  children,
}: AnalysisPanelProps) {
  return (
    <section className={`production-analysis__panel ${className}`}>
      <header className="production-analysis__panel-head">
        <span className={`production-analysis__panel-icon production-analysis__panel-icon--${tone}`}>
          <Icon aria-hidden="true" size={18} />
        </span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export const ProductionAnalysisPage = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: reportsData } = useQuery({
    queryKey: ['reportsQuery-analysis', period],
    queryFn: () => api.get<AnalysisReportsData>('/reports/query', {
      params: {
        timeRange: period === 'daily' ? 'today' : (period === 'weekly' ? 'last_7_days' : 'month'),
        lineId: 'all',
        machineId: 'all',
      },
    }).then((response) => response.data),
    refetchInterval: 5000,
  });

  const { data: machines } = useQuery({
    queryKey: ['machines-list-analysis'],
    queryFn: () => api.get<AnalysisMachine[]>('/machines').then((response) => response.data),
    refetchInterval: 3000,
  });

  const hourlyOutputData = useMemo(() => {
    if (!reportsData?.chartData || reportsData.chartData.length === 0) {
      return [
        { time: '08:00', actual: 0, target: 0 },
        { time: '09:00', actual: 0, target: 0 },
        { time: '10:00', actual: 0, target: 0 },
        { time: '11:00', actual: 0, target: 0 },
        { time: '12:00', actual: 0, target: 0 },
        { time: '13:00', actual: 0, target: 0 },
        { time: '14:00', actual: 0, target: 0 },
      ];
    }

    return reportsData.chartData.map((point) => ({
      time: point.hour,
      actual: point.output,
      target: point.target || Math.round(point.output * 1.1) || 0,
    }));
  }, [reportsData]);

  const stationOeeData = useMemo(() => {
    if (!machines || machines.length === 0) return [];

    return machines
      .filter((machine) => machine.approvalStatus === 'APPROVED' || machine.approvalStatus === 'approved')
      .map((machine) => {
        const oee = machine.lastPlcData?.production?.oee ?? machine.lastPlcData?.tags?.oee ?? 0;
        let color = 'var(--color-error)';
        if (oee >= 90) color = 'var(--color-running)';
        else if (oee >= 75) color = 'var(--color-warn)';

        return { name: machine.name, oee, color };
      });
  }, [machines]);

  const totalScrap = reportsData?.summary?.totalScrap ?? 0;
  const paretoDefects = useMemo(() => [
    {
      type: t('productionAnalysisPage.defect1', 'Lực siết vượt giới hạn'),
      station: t('productionAnalysisPage.station1', 'S05 Lắp ráp'),
      count: Math.round(totalScrap * 0.45),
      ratio: totalScrap > 0 ? 41.8 : 0,
      color: 'var(--color-error)',
    },
    {
      type: t('productionAnalysisPage.defect2', 'Sai lệch lực ép nắp'),
      station: t('productionAnalysisPage.station2', 'S02 Ép nắp'),
      count: Math.round(totalScrap * 0.25),
      ratio: totalScrap > 0 ? 25.2 : 0,
      color: '#ffb739',
    },
    {
      type: t('productionAnalysisPage.defect3', 'Thiếu Jumper/Lắp lệch'),
      station: t('productionAnalysisPage.station3', 'S01 Cấp phôi'),
      count: Math.round(totalScrap * 0.15),
      ratio: totalScrap > 0 ? 16.5 : 0,
      color: '#d6e33d',
    },
    {
      type: t('productionAnalysisPage.defect4', 'Mối hàn SMB dị dạng'),
      station: t('productionAnalysisPage.station4', 'S03 Hàn mạch'),
      count: Math.round(totalScrap * 0.1),
      ratio: totalScrap > 0 ? 9.8 : 0,
      color: '#ff9c9c',
    },
    {
      type: t('productionAnalysisPage.defect5', 'Lệch phiến tản nhiệt'),
      station: t('productionAnalysisPage.station5', 'S04 Lắp nhiệt'),
      count: Math.max(0, totalScrap - Math.round(totalScrap * 0.95)),
      ratio: totalScrap > 0 ? 6.7 : 0,
      color: '#a4a4a4',
    },
  ], [t, totalScrap]);

  const oeeDetails = useMemo(() => {
    if (!machines || machines.length === 0) {
      return { planned: 480, downtime: -480, speed: 0, quality: 0, effective: 0 };
    }

    let activeCount = 0;
    let runningCount = 0;
    machines.forEach((machine) => {
      if (machine.approvalStatus === 'APPROVED' || machine.approvalStatus === 'approved') {
        activeCount += 1;
        if (machine.status === 'running' || machine.status === 'đang chạy') {
          runningCount += 1;
        }
      }
    });

    if (activeCount === 0) {
      return { planned: 480, downtime: -480, speed: 0, quality: 0, effective: 0 };
    }

    const ratio = runningCount / activeCount;
    const planned = 480;
    const downtime = -Math.round(planned * (1 - ratio));
    const effective = Math.round(planned * ratio * 0.85);
    const speed = -Math.round(planned * ratio * 0.1);
    const quality = -Math.round(planned * ratio * 0.05);

    return { planned, downtime, speed, quality, effective };
  }, [machines]);

  const dateLabel = `${currentTime.getFullYear()}-${String(currentTime.getMonth() + 1).padStart(2, '0')}-${String(currentTime.getDate()).padStart(2, '0')}`;

  return (
    <div className="production-analysis">
      <header className="production-analysis__intro">
        <div className="production-analysis__heading">
          <h1>{t('productionAnalysisPage.title', 'PHÂN TÍCH SẢN LƯỢNG & HIỆU SUẤT')}</h1>
        </div>

        <div className="production-analysis__toolbar">
          <div className="production-analysis__period" role="group" aria-label={t('productionAnalysisPage.title', 'Production analysis')}>
            {(['daily', 'weekly', 'monthly'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
                className={period === value ? 'is-active' : ''}
              >
                {t(`productionAnalysisPage.${value}`, value)}
              </button>
            ))}
          </div>
          <span className="production-analysis__date">
            <CalendarDays aria-hidden="true" size={15} />
            {dateLabel}
          </span>
        </div>
      </header>

      <div className="production-analysis__content">
        <div className="production-analysis__top-grid">
          <AnalysisPanel
            title={t('productionAnalysisPage.hourlyTitle', 'SẢN LƯỢNG HÔM NAY VS MỤC TIÊU (THEO GIỜ)')}
            icon={TrendingUp}
            className="production-analysis__output-panel"
          >
            <div className="production-analysis__chart production-analysis__chart--output">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyOutputData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="production-analysis-output" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#343434" strokeDasharray="3 3" />
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#b0b0b0', fontSize: 10 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tick={{ fill: '#b0b0b0', fontSize: 10 }}
                    domain={[0, 16000]}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <RechartsTooltip
                    contentStyle={{ background: '#232323', border: '1px solid #454545', borderRadius: 8 }}
                    labelStyle={{ color: '#f8f8f8', fontWeight: 600 }}
                  />
                  <Area
                    name={t('productionAnalysisPage.actualOutput', 'Sản lượng thực tế')}
                    type="monotone"
                    dataKey="actual"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    fill="url(#production-analysis-output)"
                    dot={{ r: 3, stroke: 'var(--color-primary)', strokeWidth: 2, fill: 'var(--color-surface-container)' }}
                  />
                  <Area
                    name={t('productionAnalysisPage.targetOutput', 'Sản lượng mục tiêu')}
                    type="monotone"
                    dataKey="target"
                    stroke="#858585"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="none"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AnalysisPanel>

          <AnalysisPanel
            title={t('productionAnalysisPage.oeeAnalysisTitle', 'PHÂN TÍCH CHI TIẾT OEE')}
            icon={BarChart2}
            tone="amber"
            className="production-analysis__oee-panel"
          >
            <dl className="production-analysis__oee-list">
              <div>
                <dt>{t('productionAnalysisPage.plannedTime', 'Thời gian kế hoạch')}</dt>
                <dd>{oeeDetails.planned} {t('common.minuteName', 'phút')}</dd>
              </div>
              <div>
                <dt>{t('productionAnalysisPage.downTimeLoss', 'Tổn thất dừng máy')}</dt>
                <dd className="is-danger">{oeeDetails.downtime} {t('common.minuteName', 'phút')}</dd>
              </div>
              <div>
                <dt>{t('productionAnalysisPage.speedLoss', 'Tổn thất tốc độ')}</dt>
                <dd className="is-amber">{oeeDetails.speed} {t('common.minuteName', 'phút')}</dd>
              </div>
              <div>
                <dt>{t('productionAnalysisPage.qualityLoss', 'Tổn thất chất lượng')}</dt>
                <dd className="is-amber">{oeeDetails.quality} {t('common.minuteName', 'phút')}</dd>
              </div>
              <div className="production-analysis__oee-effective">
                <dt>{t('productionAnalysisPage.effectiveTime', 'Thời gian hữu ích')}</dt>
                <dd>{oeeDetails.effective} {t('common.minuteName', 'phút')}</dd>
              </div>
            </dl>
          </AnalysisPanel>
        </div>

        <div className="production-analysis__bottom-grid">
          <AnalysisPanel
            title={t('productionAnalysisPage.paretoTitle', 'PHÂN TÍCH PARETO PHẾ PHẨM')}
            icon={AlertCircle}
            className="production-analysis__pareto-panel"
          >
            <p className="production-analysis__panel-copy">
              {t('productionAnalysisPage.paretoSubtitle', 'Lũy kế lỗi tháng này: {{count}} pcs · Tỷ lệ đạt bình quân: {{rate}}%', { count: 986, rate: 99.08 })}
            </p>
            <div className="production-analysis__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('productionAnalysisPage.defectType', 'Loại phế phẩm')}</th>
                    <th scope="col">{t('productionAnalysisPage.station', 'Trạm máy')}</th>
                    <th scope="col" className="is-number">{t('productionAnalysisPage.quantity', 'Số lượng')}</th>
                    <th scope="col" className="is-number">{t('productionAnalysisPage.ratio', 'Tỷ lệ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paretoDefects.map((defect, index) => (
                    <tr key={`${defect.type}-${index}`}>
                      <td>{defect.type}</td>
                      <td className="production-analysis__station">{defect.station}</td>
                      <td className="is-number">{defect.count}</td>
                      <td className="is-number production-analysis__ratio-cell">
                        <span>{defect.ratio}%</span>
                        <span className="production-analysis__ratio-bar" aria-hidden="true">
                          <span style={{ width: `${defect.ratio}%`, backgroundColor: defect.color }} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AnalysisPanel>

          <AnalysisPanel
            title={t('productionAnalysisPage.compareOeeTitle', 'SO SÁNH HIỆU SUẤT OEE CÁC TRẠM')}
            icon={CheckCircle2}
            tone="green"
            className="production-analysis__station-panel"
          >
            <div className="production-analysis__chart production-analysis__chart--stations">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stationOeeData} margin={{ top: 10, right: 10, left: -12, bottom: 5 }} barSize={30}>
                  <CartesianGrid vertical={false} stroke="#343434" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#b0b0b0', fontSize: 10 }}
                    interval={0}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tick={{ fill: '#b0b0b0', fontSize: 10 }}
                    domain={[50, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <RechartsTooltip
                    contentStyle={{ background: '#232323', border: '1px solid #454545', borderRadius: 8 }}
                    labelStyle={{ color: '#f8f8f8', fontWeight: 600 }}
                    formatter={(value) => [`${value}%`, 'OEE']}
                  />
                  <Bar dataKey="oee" radius={[4, 4, 0, 0]}>
                    {stationOeeData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AnalysisPanel>
        </div>
      </div>
    </div>
  );
};

export default ProductionAnalysisPage;
