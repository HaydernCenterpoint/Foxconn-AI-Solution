import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FlowNode } from '../store/flow.store';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { getStatusKey } from '../../../shared/lib/utils';

export type EquipmentNodeType = FlowNode;

function EquipmentNodeComponent({ data, selected }: NodeProps<EquipmentNodeType>) {
  const { t } = useTranslation();
  const isError = data.status === 'error';

  const statusColors: Record<string, string> = {
    running: 'var(--color-running)',
    idle: 'var(--color-idle)',
    error: 'var(--color-error)',
    maintenance: 'var(--color-accent)',
    stopped: 'var(--color-offline)',
  };

  const statusColor = statusColors[data.status ?? 'idle'] ?? 'var(--color-outline)';

  const statusKey = getStatusKey(data.status);

  return (
    <div
      className={`min-w-52 rounded-xl border transition-all duration-150 ${
        selected ? 'ring-2' : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: selected
          ? 'var(--color-primary)'
          : (statusKey === 'running' || statusKey === 'error'
              ? 'var(--color-error)'
              : (['stopped', 'idle', 'offline', 'disconnected'].includes(statusKey)
                  ? 'var(--color-warn)'
                  : 'var(--color-outline-variant)')),
        borderWidth: selected ? '1.5px' : '2px',
        boxShadow: selected ? 'var(--shadow-3)' : 'var(--shadow-2)',
        color: 'var(--color-on-surface)',
        '--tw-ring-color': 'var(--color-primary)',
      } as React.CSSProperties}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!h-3 !w-3 !border-2"
        style={{
          backgroundColor: 'var(--color-primary)',
          borderColor: 'var(--color-surface)',
        }}
      />

      <div
        className="border-b px-3 py-2"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <div className="flex items-start gap-2">
          <div
            className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-primary)',
            }}
          >
            <Cpu size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-bold"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {data.label}
            </p>
            <p
              className="truncate font-mono text-[11px]"
              style={{ color: 'var(--color-on-surface-variant)' }}
            >
              {data.equipmentCode || data.equipmentId || '-'}
            </p>
          </div>
          {isError && <AlertTriangle size={15} style={{ color: 'var(--color-error)' }} />}
        </div>
      </div>

      <div className="space-y-2 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--color-on-surface-variant)' }}>IP</span>
          <span
            className="font-mono font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {data.ipAddress || '-'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--color-on-surface-variant)' }}>{t('lines.node.status')}</span>
          <StatusBadge status={data.status ?? 'idle'} size="sm" />
        </div>

        {data.description && (
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--color-on-surface-variant)' }}>
              {t('flowDesigner.properties.type')}
            </span>
            <span
              className="text-xs font-medium capitalize"
              style={{ color: statusColor }}
            >
              {data.nodeType}
            </span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2"
        style={{
          backgroundColor: statusColor,
          borderColor: 'var(--color-surface)',
        }}
      />
    </div>
  );
}

export const EquipmentNode = memo(EquipmentNodeComponent);
