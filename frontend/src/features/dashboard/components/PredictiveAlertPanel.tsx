
import { useTranslation } from 'react-i18next';
import { MaterialSymbol } from '../../../shared/components/ui/MaterialSymbol';
import type { AssetHealth, PredictiveAlert } from '../services/predictiveAlerts.api';

interface PredictiveAlertPanelProps {
  alerts: readonly PredictiveAlert[];
  healthByAssetId: Readonly<Record<string, AssetHealth | undefined>>;
  isLoading?: boolean;
  isError?: boolean;
}

function healthTone(score: number): 'good' | 'warning' | 'critical' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warning';
  return 'critical';
}

export function PredictiveAlertPanel({
  alerts,
  healthByAssetId,
  isLoading = false,
  isError = false,
}: PredictiveAlertPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="modern-dashboard__panel modern-dashboard__predictive-panel">
      <div className="modern-dashboard__panel-head">
        <h2><MaterialSymbol name="psychology" size={17} /> {t('dashboardPage.modern.predictiveAlerts')}</h2>
        <MaterialSymbol name="cardiology" size={17} label={t('dashboardPage.modern.healthScoreLabel')} />
      </div>

      {alerts.length === 0 ? (
        <p className="modern-dashboard__predictive-empty" role={isLoading || isError ? 'status' : undefined}>
          {isLoading
            ? t('dashboardPage.modern.predictiveAlertsLoading')
            : isError
              ? t('dashboardPage.modern.predictiveAlertsUnavailable')
              : t('dashboardPage.modern.noPredictiveAlerts')}
        </p>
      ) : (
        <div className="modern-dashboard__predictive-list">
          {alerts.slice(0, 3).map((alert) => {
            const health = healthByAssetId[alert.asset_id];
            const score = health?.health_score;

            return (
              <details className="modern-dashboard__predictive-alert" key={alert.alert_id}>
                <summary>
                  <span className="modern-dashboard__predictive-copy">
                    <strong>{alert.title}</strong>
                    <small>{alert.asset_name || alert.asset_id}</small>
                  </span>
                  <span className={`modern-dashboard__predictive-severity modern-dashboard__predictive-severity--${alert.severity.toLowerCase()}`}>
                    {alert.severity}
                  </span>
                  <span className={`modern-dashboard__health-score${score === undefined ? '' : ` modern-dashboard__health-score--${healthTone(score)}`}`}>
                    {score === undefined
                      ? t('dashboardPage.modern.healthUnavailable')
                      : t('dashboardPage.modern.healthScore', { score: Math.round(score) })}
                  </span>
                </summary>
                <div className="modern-dashboard__predictive-details">
                  <p>{alert.description || t('dashboardPage.modern.noPredictiveDetails')}</p>
                  {alert.recommended_actions.length > 0 && (
                    <>
                      <h3>{t('dashboardPage.modern.recommendedActions')}</h3>
                      <ul>{alert.recommended_actions.map((action) => <li key={action}>{action}</li>)}</ul>
                    </>
                  )}
                  {health && (
                    <dl>
                      <div><dt>{t('dashboardPage.modern.uptime')}</dt><dd>{Math.round(health.uptime_pct)}%</dd></div>
                      <div><dt>{t('dashboardPage.modern.performance')}</dt><dd>{Math.round(health.performance_pct)}%</dd></div>
                      <div><dt>{t('dashboardPage.modern.maintenance')}</dt><dd>{health.maintenance_overdue ? t('dashboardPage.modern.maintenanceOverdue') : t('dashboardPage.modern.maintenanceOnSchedule')}</dd></div>
                    </dl>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
