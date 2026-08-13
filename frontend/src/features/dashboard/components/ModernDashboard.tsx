import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Box,
  CircleAlert,
  Factory,
  Gauge,
  PackageCheck,
  Search,
  ShoppingBag,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { AssetHealth, PredictiveAlert } from '../services/predictiveAlerts.api';
import { PredictiveAlertPanel } from './PredictiveAlertPanel';
import './modern-dashboard.css';

gsap.registerPlugin(useGSAP);

interface ModernDashboardProps {
  viewModel: DashboardViewModel;
  username: string;
  basePath: string;
  isLoading?: boolean;
  isError?: boolean;
  predictiveAlerts?: readonly PredictiveAlert[];
  healthByAssetId?: Readonly<Record<string, AssetHealth | undefined>>;
  isPredictiveAlertsLoading?: boolean;
  isPredictiveAlertsError?: boolean;
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

function routeFor(basePath: string, route: string): string {
  return basePath === '/' ? `/${route}` : `${basePath}/${route}`;
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`modern-dashboard__panel ${className}`}>
      <div className="modern-dashboard__panel-head">
        <h2>{title}</h2>
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
  predictiveAlerts = [],
  healthByAssetId = {},
  isPredictiveAlertsLoading = false,
  isPredictiveAlertsError = false,
}: ModernDashboardProps) {
  const { i18n, t } = useTranslation();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const locale = resolveLocale(i18n.resolvedLanguage ?? i18n.language);
  const query = search.trim().toLocaleLowerCase();
  const linesRoute = routeFor(basePath, 'lines');

  const visibleLines = useMemo(
    () => viewModel.lineStatuses.filter((line) => !query || line.name.toLocaleLowerCase().includes(query)),
    [query, viewModel.lineStatuses],
  );

  const chartData = viewModel.stockBars.filter((point) => point.hasData);
  const chartTotal = chartData.reduce((total, point) => total + point.current, 0);
  const hourlyPeak = Math.max(0, ...chartData.map((point) => point.current));
  const activeLineCount = viewModel.lineStatuses.filter((line) => line.status === 'active').length;

  useGSAP(() => {
    if (typeof window === 'undefined'
      || typeof window.matchMedia !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const cards = gsap.utils.toArray<HTMLElement>('.modern-dashboard__kpi, .modern-dashboard__panel');
    gsap.from(cards, {
      opacity: 0,
      y: 18,
      duration: 0.55,
      stagger: 0.04,
      ease: 'power3.out',
      clearProps: 'transform',
    });
  }, { scope: dashboardRef });

  return (
    <div ref={dashboardRef} className="modern-dashboard modern-dashboard--compact">
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
                        fill={point.current === hourlyPeak ? 'var(--color-primary)' : 'var(--color-text-muted)'}
                        key={point.name}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <PanelEmpty>{t('dashboardPage.modern.noTrendData')}</PanelEmpty>}
        </Panel>

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

          <PredictiveAlertPanel
            alerts={predictiveAlerts}
            healthByAssetId={healthByAssetId}
            isLoading={isPredictiveAlertsLoading}
            isError={isPredictiveAlertsError}
          />
        </aside>
      </div>
    </div>
  );
}
