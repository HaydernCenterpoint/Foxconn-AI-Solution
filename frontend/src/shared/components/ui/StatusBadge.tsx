import { useTranslation } from 'react-i18next';
import { getStatusKey, STATUS_LABELS } from '../../lib/utils';
import { Badge, type BadgeVariant } from './Badge';

const STATUS_TO_VARIANT: Record<string, BadgeVariant> = {
  running: 'running',
  error: 'error',
  warning: 'warning',
  warn: 'warning',
  idle: 'idle',
  stopped: 'neutral',
  maintenance: 'maintenance',
  offline: 'offline',
  disconnected: 'disconnected',
  info: 'info',
};

interface StatusBadgeProps {
  status?: string | null;
  showDot?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StatusBadge({ status, showDot = true, size = 'md', className = '' }: StatusBadgeProps) {
  const { t } = useTranslation();
  const key = getStatusKey(status);
  const label = t(`common.machineStatus.${key}`, { defaultValue: STATUS_LABELS[key] });
  const variant = STATUS_TO_VARIANT[key] ?? 'neutral';

  return (
    <Badge variant={variant} size={size} dot={showDot} className={className}>
      {label}
    </Badge>
  );
}
