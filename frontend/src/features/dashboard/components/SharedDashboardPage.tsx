import { ModernDashboardPage, type DashboardRole } from './ModernDashboardPage';

export type { DashboardRole };

interface SharedDashboardPageProps {
  role?: DashboardRole;
}

export function SharedDashboardPage({ role = 'engineer' }: SharedDashboardPageProps) {
  return <ModernDashboardPage role={role} />;
}

export default SharedDashboardPage;
