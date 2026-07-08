import { useAuthStore } from '../store/auth.store';
import { useLocation } from 'react-router-dom';

export function usePermissions() {
  const role = useAuthStore(s => s.role);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const location = useLocation();

  const isUnderAdminRoute = location.pathname.startsWith('/admin');

  const isAdmin = isUnderAdminRoute && isAuthenticated && role === 'ADMIN';
  const isEngineer = isUnderAdminRoute && isAuthenticated && role === 'ENGINEER';
  const isGuest = !isUnderAdminRoute || !isAuthenticated || role === 'GUEST';

  return {
    role,
    isAuthenticated,
    canEdit: isAdmin || isEngineer,
    canAcknowledge: isAdmin || isEngineer,
    canCreate: isAdmin,
    isViewer: isGuest,
    isEngineer,
    isAdmin,
  };
}
