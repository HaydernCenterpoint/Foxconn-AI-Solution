import { ModernDashboardPage, type DashboardRole } from './ModernDashboardPage';

export type { DashboardRole };

interface SharedDashboardPageProps {
  role?: DashboardRole;
  /** Compatibility bridge for the legacy viewer route; removed by the operations-pages refresh. */
  hideBottomCharts?: boolean;
}

export function SharedDashboardPage({ role = 'engineer' }: SharedDashboardPageProps) {
  return <ModernDashboardPage role={role} />;
}

export default SharedDashboardPage;
