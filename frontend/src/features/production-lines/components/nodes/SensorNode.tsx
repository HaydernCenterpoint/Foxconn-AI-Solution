import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Activity, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../../../../shared/lib/translator';
import type { FlowNode } from '../../store/flow.store';
import { StatusBadge } from '../../../../shared/components/ui/StatusBadge';
import { getStatusKey } from '../../../../shared/lib/utils';

type SensorNodeProps = NodeProps<FlowNode>;

function SensorNodeComponent({ data, selected }: SensorNodeProps) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const status = data.status || 'running';
  const statusKey = getStatusKey(status);

  return (
    <div
      className={`min-w-48 rounded-xl border transition-all duration-150 ${
        selected ? 'ring-2' : ''
      }`}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: selected
          ? 'var(--color-primary)'
          : (statusKey === 'running'
              ? 'var(--color-success)'
              : (statusKey === 'error'
                  ? 'var(--color-error)'
                  : (['stopped', 'idle', 'offline', 'disconnected'].includes(statusKey)
                      ? 'var(--color-warn)'
                      : 'var(--color-outline-variant)'))),
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
        className="flex items-center gap-3 border-b px-3 py-2"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            backgroundColor: 'var(--color-information-container)',
            color: 'var(--color-information)',
          }}
        >
          <Activity size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-bold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {tDynamic(data.label)}
          </p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {t('flowDesigner.nodeTypes.sensor')}
          </p>
        </div>
        <Radio size={14} style={{ color: 'var(--color-on-surface-variant)' }} />
      </div>

      <div className="space-y-2 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('flowDesigner.properties.status')}
          </span>
          <StatusBadge status={status} size="sm" />
        </div>
        {data.description && (
          <p
            className="truncate text-[11px]"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {tDynamic(data.description)}
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!h-3 !w-3 !border-2"
        style={{
          backgroundColor: 'var(--color-running)',
          borderColor: 'var(--color-surface)',
        }}
      />
    </div>
  );
}

export const SensorNode = memo(SensorNodeComponent);
