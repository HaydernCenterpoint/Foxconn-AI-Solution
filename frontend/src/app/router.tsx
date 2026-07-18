import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingState } from '../shared/components/ui/EmptyState';
import { AppLayout } from '../shared/components/layout/AppLayout';
import { ProtectedRoute } from '../features/auth/components/ProtectedRoute';
import { useAuthStore } from '../shared/store/auth.store';

const ViewerLayout = lazy(() => import('../shared/components/layout/ViewerLayout'));

// ── Auth pages (public) ──────────────────────────────────────────────
const LoginPage = lazy(() => import('../pages/LoginPage'));
const ForbiddenPage = lazy(() => import('../pages/ForbiddenPage'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'));

// ── Admin pages ──────────────────────────────────────────────────────
const AdminDashboardPage = lazy(() => import('../pages/admin/DashboardPage').then(m => ({ default: m.DashboardPage })));
const AdminSettingsPage = lazy(() => import('../pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AdminUserManagementPage = lazy(() => import('../pages/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const AdminAuditLogPage = lazy(() => import('../pages/admin/AuditLogPage').then(m => ({ default: m.AuditLogPage })));

// ── Engineer pages ───────────────────────────────────────────────────
const EngineerDashboardPage = lazy(() => import('../pages/engineer/DashboardPage').then(m => ({ default: m.DashboardPage })));
const EngineerSettingsPage = lazy(() => import('../pages/engineer/SettingsPage').then(m => ({ default: m.SettingsPage })));

// ── Viewer pages ─────────────────────────────────────────────────────
const ViewerDashboardPage = lazy(() => import('../pages/viewer/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ViewerSettingsPage = lazy(() => import('../pages/viewer/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SlideshowPage = lazy(() => import('../pages/viewer/SlideshowPage').then(m => ({ default: m.SlideshowPage })));
const ProductionAnalysisPage = lazy(() => import('../pages/viewer/ProductionAnalysisPage').then(m => ({ default: m.ProductionAnalysisPage })));

// ── Shared consolidated pages ────────────────────────────────────────
const LinesPage = lazy(() => import('../pages/LinesPage'));
const MachineListPage = lazy(() => import('../pages/MachineListPage'));
const MachineDetailPage = lazy(() => import('../pages/MachineDetailPage'));
const AlarmPage = lazy(() => import('../pages/AlarmPage'));

// ── Shared simulation page ───────────────────────────────────────────
const SimulationPage = lazy(() => import('../pages/SimulationPage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const SystemPage = lazy(() => import('../pages/SystemPage'));

// ── Role-based routing gates ─────────────────────────────────────────
const DashboardPage = () => {
  const role = useAuthStore(s => s.role);
  if (role === 'ADMIN') return <AdminDashboardPage />;
  if (role === 'ENGINEER') return <EngineerDashboardPage />;
  return <ViewerDashboardPage />;
};

const SettingsPage = () => {
  const role = useAuthStore(s => s.role);
  if (role === 'ADMIN') return <AdminSettingsPage />;
  return <EngineerSettingsPage />;
};

function withSuspense(children: ReactNode) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function AppRouter() {
  return (
    <Routes>
      {/* Auth routes (public) */}
      <Route path="/login" element={withSuspense(<LoginPage />)} />

      {/* Presentation slideshow layout */}
      <Route path="/slideshow" element={withSuspense(<SlideshowPage />)} />

      {/* Authenticated Admin/Engineer shell */}
      <Route path="admin" element={<AppLayout />}>
        <Route index element={withSuspense(<ProtectedRoute><DashboardPage /></ProtectedRoute>)} />
        <Route path="lines" element={withSuspense(<ProtectedRoute><LinesPage /></ProtectedRoute>)} />
        <Route path="machines" element={withSuspense(<ProtectedRoute><MachineListPage /></ProtectedRoute>)} />
        <Route path="machines/:id" element={withSuspense(<ProtectedRoute><MachineDetailPage /></ProtectedRoute>)} />
        <Route path="alarms" element={withSuspense(<ProtectedRoute><AlarmPage /></ProtectedRoute>)} />
        <Route path="settings" element={withSuspense(<ProtectedRoute><SettingsPage /></ProtectedRoute>)} />
        <Route path="reports" element={withSuspense(<ProtectedRoute><ReportsPage /></ProtectedRoute>)} />
        <Route path="system" element={withSuspense(<ProtectedRoute><SystemPage /></ProtectedRoute>)} />
        <Route path="simulation" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN', 'ENGINEER']}><SimulationPage /></ProtectedRoute>)} />
        <Route path="users" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN']}><AdminUserManagementPage /></ProtectedRoute>)} />
        <Route path="audit-logs" element={withSuspense(<ProtectedRoute allowedRoles={['ADMIN']}><AdminAuditLogPage /></ProtectedRoute>)} />
        
        {/* Redirects inside admin */}
        <Route path="flow-designer" element={<Navigate to="/admin/lines" replace />} />
        <Route path="dashboard" element={<Navigate to="/admin" replace />} />
      </Route>

      {/* Public viewer routes (read-only, no auth) */}
      <Route element={withSuspense(<ViewerLayout />)}>
        <Route index element={withSuspense(<ViewerDashboardPage />)} />
        <Route path="lines" element={withSuspense(<LinesPage />)} />
        <Route path="machines" element={withSuspense(<MachineListPage />)} />
        <Route path="machines/:id" element={withSuspense(<MachineDetailPage />)} />
        <Route path="alarms" element={withSuspense(<AlarmPage />)} />
        <Route path="settings" element={withSuspense(<ViewerSettingsPage />)} />
        <Route path="production-analysis" element={withSuspense(<ProductionAnalysisPage />)} />
        <Route path="system" element={withSuspense(<SystemPage />)} />
        
        {/* Public redirects */}
        <Route path="viewer/*" element={<Navigate to="/" replace />} />
        <Route path="flow-designer" element={<Navigate to="/lines" replace />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />

        {/* Error pages */}
        <Route path="403" element={withSuspense(<ForbiddenPage />)} />
        <Route path="404" element={withSuspense(<NotFoundPage />)} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
    </Routes>
  );
}
export default AppRouter;
