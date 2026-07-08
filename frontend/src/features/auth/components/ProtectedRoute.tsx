import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../../shared/store/auth.store';
import type { ReactNode } from 'react';
import { hasPermission, type Permission } from '../../../app/permissions';
import type { UserRole } from '../../../shared/types/domain';
import { PermissionDeniedState } from './PermissionDeniedState';
import { SplashScreen } from './SplashScreen';

interface Props {
  children: ReactNode;
  allowedRoles?: UserRole[];
  permission?: Permission;
}

export function ProtectedRoute({ children, allowedRoles, permission }: Props) {
  const { isAuthenticated, role, sessionChecked } = useAuthStore();

  if (!sessionChecked) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ reason: 'auth-required' }} />;
  }

  if (permission && !hasPermission(role, permission)) {
    return <PermissionDeniedState />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <PermissionDeniedState />;
  }

  return <>{children}</>;
}
