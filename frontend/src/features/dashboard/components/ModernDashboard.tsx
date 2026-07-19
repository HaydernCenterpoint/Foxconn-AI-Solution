import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  Box,
  ChevronRight,
  CircleAlert,
  Factory,
  Gauge,
  PackageCheck,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  TrendingDown,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DashboardKpiCard,
  DashboardLineStatus,
  DashboardViewModel,
} from '../dashboardViewModel';
import './modern-dashboard.css';

interface ModernDashboardProps {
  viewModel: DashboardViewModel;
  username: string;
  basePath: string;
  isLoading?: boolean;
  isError?: boolean;
}

interface KpiMeta {
  icon: LucideIcon;
  accent: 'red' | 'amber' | 'lime';
}

const KPI_META: Record<DashboardKpiCard['id'], KpiMeta> = {
  'total-production': { icon: Wrench, accent: 'red' },
  'production-efficiency': { icon: Gauge, accent: 'amber' },
  'active-alarms': { icon: CircleAlert, accent: 'lime' },
};

const KPI_LABEL_KEYS: Record<DashboardKpiCard['id'], string> = {
  'total-production': 'dashboardPage.modern.totalProduction',
  'production-efficiency': 'dashboardPage.modern.productionEfficiency',
  'active-alarms': 'dashboardPage.modern.activeAlarms',
};

const STATUS_LABEL_KEYS: Record<DashboardLineStatus, string> = {
  active: 'dashboardPage.modern.statusActive',
  idle: 'dashboardPage.modern.statusIdle',
  maintenance: 'dashboardPage.modern.statusMaintenance',
  error: 'dashboardPage.modern.statusError',
  offline: 'dashboardPage.modern.statusOffline',
  unknown: 'dashboardPage.modern.statusUnknown',
};

function resolveLocale(language: string | undefined): string {
  if (!language) return 'vi-VN';
  if (language.startsWith('zh')) return 'zh-CN';
  if (language.startsWith('en')) return 'en-US';
  return 'vi-VN';
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatAlarmDate(value: string, locale: string, fallback: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function routeFor(basePath: string, route: string): string {
  return basePath === '/' ? `/${route}` : `${basePath}/${route}`;
}

function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`modern-dashboard__panel ${className}`}>
      <div className="modern-dashboard__panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="modern-dashboard__empty">{children}</p>;
}

export function ModernDashboard({
  viewModel,
  username,
  basePath,
  isLoading = false,
  isError = false,
}: ModernDashboardProps) {
  const { i18n, t } = useTranslation();
  const [search, setSearch] = useState('');
  const [onlyActiveAlerts, setOnlyActiveAlerts] = useState(false);
  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
  const query = search.trim().toLocaleLowerCase();
  const machinesRoute = routeFor(basePath, 'machines');
  const linesRoute = routeFor(basePath, 'lines');
  const alarmsRoute = routeFor(basePath, 'alarms');

  const visibleLines = useMemo(
    () => viewModel.lineStatuses.filter((line) => !query || line.name.toLocaleLowerCase().includes(query)),
    [query, viewModel.lineStatuses],
  );

  const visibleAlarms = useMemo(
    () => viewModel.pendingOrders.filter((alarm) => {
      const matchesSearch = !query || [alarm.machineName, alarm.message, alarm.severity]
        .some((value) => value.toLocaleLowerCase().includes(query));
      const matchesFilter = !onlyActiveAlerts || alarm.status.toLocaleUpperCase() === 'ACTIVE';
      return matchesSearch && matchesFilter;
    }),
    [onlyActiveAlerts, query, viewModel.pendingOrders],
  );

  const visibleProducts = useMemo(
    () => viewModel.topProducts.filter((product) => !query || product.name.toLocaleLowerCase().includes(query)),
    [query, viewModel.topProducts],
  );

  const chartData = viewModel.stockBars.filter((point) => point.hasData);
  const chartTotal = chartData.reduce((total, point) => total + point.current, 0);
  const hourlyPeak = Math.max(0, ...chartData.map((point) => point.current));
  const hasTrendData = viewModel.trend.some((point) => point.hasData);
  const activeLineCount = viewModel.lineStatuses.filter((line) => line.status === 'active').length;
  const defectsData = [
    { name: t('dashboardPage.modern.goodTotal'), value: viewModel.defects.nonDefectiveTotal, color: '#3b3b3b' },
    { name: t('dashboardPage.modern.defectEstimate'), value: viewModel.defects.total, color: '#ef4444' },
  ];

  return (
    <div className="modern-dashboard">
      <header className="modern-dashboard__intro">
        <div>
          <p>{t('dashboardPage.modern.welcome')}</p>
          <h1>{t('dashboardPage.modern.overview')}</h1>
          <span>{username || t('dashboardPage.modern.operator')}</span>
        </div>
        <label className="modern-dashboard__search">
          <Search aria-hidden="true" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('dashboardPage.modern.searchPlaceholder')}
            aria-label={t('dashboardPage.modern.searchAria')}
          />
        </label>
      </header>

      {(isLoading || isError) && (
        <div className={`modern-dashboard__notice ${isError ? 'is-error' : ''}`} role="status">
          {isError ? t('dashboardPage.modern.loadError') : t('dashboardPage.modern.loading')}
        </div>
      )}

      <div className="modern-dashboard__kpi-grid">
        {viewModel.kpis.map((kpi) => {
          const meta = KPI_META[kpi.id];
          const Icon = meta.icon;
          const unit = kpi.unit === '%'
            ? '%'
            : kpi.unit === 'alarms'
              ? t('dashboardPage.modern.alarmsUnit')
              : t('dashboardPage.modern.unit');

          return (
            <article className={`modern-dashboard__kpi modern-dashboard__kpi--${meta.accent}`} key={kpi.id}>
              <span className="modern-dashboard__kpi-icon"><Icon aria-hidden="true" size={20} /></span>
              <div>
                <h2>{t(KPI_LABEL_KEYS[kpi.id])}</h2>
                <strong>{formatNumber(kpi.value, locale)}{kpi.unit === '%' ? '%' : ''}</strong>
              </div>
              <span className="modern-dashboard__kpi-unit">{unit}</span>
            </article>
          );
        })}
      </div>

      <div className="modern-dashboard__layout">
        <div className="modern-dashboard__primary-grid">
            <Panel title={t('dashboardPage.modern.productionByHour')} className="modern-dashboard__production-panel">
              <div className="modern-dashboard__mini-stats">
                <div>
                  <Box aria-hidden="true" />
                  <span>{t('dashboardPage.modern.hourlyPeak')}</span>
                  <strong>{formatNumber(hourlyPeak, locale)} {t('dashboardPage.modern.unit')}</strong>
                </div>
                <div>
                  <PackageCheck aria-hidden="true" />
                  <span>{t('dashboardPage.modern.goodTotal')}</span>
                  <strong>{formatNumber(viewModel.defects.nonDefectiveTotal, locale)} {t('dashboardPage.modern.unit')}</strong>
                </div>
                <div>
                  <ShoppingBag aria-hidden="true" />
                  <span>{t('dashboardPage.modern.totalLines')}</span>
                  <strong>{formatNumber(activeLineCount, locale)} {t('dashboardPage.modern.activeLines')}</strong>
                </div>
              </div>
              {chartData.length > 0 ? (
                <div
                  className="modern-dashboard__chart"
                  role="img"
                  aria-label={t('dashboardPage.modern.productionChartDescription', {
                    count: chartData.length,
                    total: formatNumber(chartTotal, locale),
                  })}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={0}>
                      <CartesianGrid vertical={false} stroke="#343434" strokeDasharray="3 3" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#b0b0b0', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} width={40} tick={{ fill: '#b0b0b0', fontSize: 10 }} />
                      <Tooltip cursor={{ fill: '#ffffff0a' }} contentStyle={{ background: '#232323', border: '1px solid #454545', borderRadius: 8 }} />
                      <Bar dataKey="threshold" fill="#343434" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="current" fill="#777777" radius={[3, 3, 0, 0]}>
                        {chartData.map((point) => (
                          <Cell
                            fill={point.current === hourlyPeak ? '#ef4444' : '#777777'}
                            key={point.name}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <PanelEmpty>{t('dashboardPage.modern.noTrendData')}</PanelEmpty>}
            </Panel>

            <Panel
              title={t('dashboardPage.modern.defectRate')}
              className="modern-dashboard__defect-panel"
              action={<Link to={alarmsRoute} aria-label={t('dashboardPage.modern.allAlarms')}><ChevronRight aria-hidden="true" size={17} /></Link>}
            >
              {viewModel.defects.hasData ? (
                <div
                  className="modern-dashboard__donut"
                  role="img"
                  aria-label={t('dashboardPage.modern.defectChartDescription', {
                    count: formatNumber(viewModel.defects.total, locale),
                    rate: viewModel.defects.rate,
                  })}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={defectsData} dataKey="value" innerRadius="65%" outerRadius="91%" startAngle={112} endAngle={-248} stroke="none">
                        {defectsData.map((entry) => <Cell fill={entry.color} key={entry.name} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#232323', border: '1px solid #454545', borderRadius: 8 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div>
                    <span>{t('dashboardPage.modern.defectEstimate')}</span>
                    <strong>{formatNumber(viewModel.defects.total, locale)}</strong>
                    <small>{viewModel.defects.rate}% {t('dashboardPage.modern.defectOfProduction')}</small>
                  </div>
                </div>
              ) : <PanelEmpty>{t('dashboardPage.modern.noQualityData')}</PanelEmpty>}
            </Panel>

            <Panel title={t('dashboardPage.modern.productionTrend')} className="modern-dashboard__trend-panel" action={<TrendingDown aria-hidden="true" size={17} />}>
              {hasTrendData ? (
                <div
                  className="modern-dashboard__chart"
                  role="img"
                  aria-label={t('dashboardPage.modern.trendChartDescription', {
                    total: formatNumber(chartTotal, locale),
                  })}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={viewModel.trend.filter((point) => point.hasData)}>
                      <defs>
                        <linearGradient id="modern-dashboard-trend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#ef4444" stopOpacity="0.32" />
                          <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#343434" strokeDasharray="3 3" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#b0b0b0', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} width={40} tick={{ fill: '#b0b0b0', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: '#232323', border: '1px solid #454545', borderRadius: 8 }} />
                      <Area dataKey="production" type="monotone" stroke="#ef4444" strokeWidth={2} fill="url(#modern-dashboard-trend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <PanelEmpty>{t('dashboardPage.modern.noTrendData')}</PanelEmpty>}
            </Panel>

            <Panel
              title={t('dashboardPage.modern.recentAlerts')}
              className="modern-dashboard__alarms-panel"
              action={(
                <button
                  type="button"
                  className={onlyActiveAlerts ? 'is-active' : ''}
                  aria-pressed={onlyActiveAlerts}
                  onClick={() => setOnlyActiveAlerts((value) => !value)}
                >
                  <SlidersHorizontal aria-hidden="true" size={14} /> {onlyActiveAlerts ? t('dashboardPage.modern.open') : t('dashboardPage.modern.filter')}
                </button>
              )}
            >
              {visibleAlarms.length > 0 ? (
                <div className="modern-dashboard__alarm-table">
                  <table>
                    <caption className="modern-dashboard__sr-only">{t('dashboardPage.modern.recentAlerts')}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t('dashboardPage.modern.machine')}</th>
                        <th scope="col">{t('dashboardPage.modern.content')}</th>
                        <th scope="col">{t('dashboardPage.modern.time')}</th>
                        <th scope="col">{t('dashboardPage.modern.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleAlarms.slice(0, 4).map((alarm) => (
                        <tr key={alarm.id}>
                          <td><Link to={alarmsRoute}><b>{alarm.machineName}</b><small>{alarm.severity}</small></Link></td>
                          <td>{alarm.message}</td>
                          <td>{formatAlarmDate(alarm.createdAt, locale, t('common.notAvailable'))}</td>
                          <td><span className={`modern-dashboard__alarm-status modern-dashboard__alarm-status--${alarm.status.toLocaleLowerCase()}`}>{alarm.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <PanelEmpty>{t('dashboardPage.modern.noMatchingAlerts')}</PanelEmpty>}
            </Panel>
        </div>

        <aside className="modern-dashboard__rail">
          <Panel title={t('dashboardPage.modern.lineStatus')} className="modern-dashboard__lines-panel">
            {visibleLines.length > 0 ? (
              <div className="modern-dashboard__line-list">
                {visibleLines.slice(0, 4).map((line) => (
                  <Link className="modern-dashboard__line-item" to={linesRoute} key={line.id}>
                    <span className={`modern-dashboard__line-icon modern-dashboard__line-icon--${line.status}`}><Factory aria-hidden="true" size={19} /></span>
                    <span><b>{line.name}</b><small>{formatNumber(line.producedQuantity, locale)} {t('dashboardPage.modern.unit')} · {line.machineCount} {t('navigation.equipment')}</small></span>
                    <em className={`modern-dashboard__status modern-dashboard__status--${line.status}`}>{t(STATUS_LABEL_KEYS[line.status])}</em>
                  </Link>
                ))}
              </div>
            ) : <PanelEmpty>{t('dashboardPage.modern.noMatchingLines')}</PanelEmpty>}
          </Panel>

          <Panel
            title={t('dashboardPage.modern.topMachines')}
            className="modern-dashboard__products-panel"
            action={<Link to={machinesRoute} aria-label={t('dashboardPage.modern.machinesList')}><ChevronRight aria-hidden="true" size={17} /></Link>}
          >
            {visibleProducts.length > 0 ? (
              <div className="modern-dashboard__product-list">
                {visibleProducts.slice(0, 3).map((product) => (
                  <Link className="modern-dashboard__product" to={`${machinesRoute}/${product.id}`} key={product.id}>
                    <span><Activity aria-hidden="true" size={20} /></span>
                    <div><b>{product.name}</b><small>{formatNumber(product.quantity, locale)} {t('dashboardPage.modern.unit')}</small></div>
                  </Link>
                ))}
              </div>
            ) : <PanelEmpty>{t('dashboardPage.modern.noMachineData')}</PanelEmpty>}
          </Panel>

          <Link className="modern-dashboard__rail-action" to={machinesRoute} aria-label={t('dashboardPage.modern.openMachines')}>
            <AlertTriangle aria-hidden="true" size={17} /> {t('dashboardPage.modern.openAllMachines')}
          </Link>
        </aside>
      </div>
    </div>
  );
}
