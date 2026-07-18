import { useTranslation } from 'react-i18next';
import type { UserRole } from '../../../shared/types/domain';
import { Badge, type BadgeVariant } from '../../../shared/components/ui/Badge';

interface UserRoleBadgeProps {
  role: UserRole | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}

const ROLE_BADGE_CONFIG: Record<UserRole, { variant: BadgeVariant; labelKey: string }> = {
  ADMIN: { variant: 'primary', labelKey: 'common.role.ADMIN' },
  ENGINEER: { variant: 'info', labelKey: 'common.role.ENGINEER' },
  GUEST: { variant: 'neutral', labelKey: 'common.role.GUEST' },
};

function isUserRole(role: string): role is UserRole {
  return role === 'ADMIN' || role === 'ENGINEER' || role === 'GUEST';
}

export function UserRoleBadge({ role, size = 'sm' }: UserRoleBadgeProps) {
  const { t } = useTranslation();
  const config = role && isUserRole(role) ? ROLE_BADGE_CONFIG[role] : undefined;

  return (
    <Badge variant={config?.variant ?? 'neutral'} size={size}>
      {config ? t(config.labelKey) : role || t('common.notAvailable')}
    </Badge>
  );
}
