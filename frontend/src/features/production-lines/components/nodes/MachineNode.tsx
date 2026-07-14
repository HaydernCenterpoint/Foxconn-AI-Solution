import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Cpu, Database, Network } from 'lucide-react';
import { StatusBadge } from '../../../../shared/components/ui/StatusBadge';
import { useDynamicTranslation } from '../../../../shared/lib/translator';

export interface MachineNodeData extends Record<string, unknown> {
  id: string;
  name: string;
  machineCode?: string;
  status: string;
  ip?: string;
  productionCount?: number;
  plcConnected?: boolean;
}

type MachineNodeProps = NodeProps<Node<MachineNodeData, 'machineNode'>>;

function MachineNodeComponent({ data, selected }: MachineNodeProps) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const hasProductionCount = typeof data.productionCount === 'number' && Number.isFinite(data.productionCount);

  return (
    <div className={`w-60 rounded-md border bg-surface-1 text-text-primary shadow-md ${selected ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
      <Handle type="target" position={Position.Left} id="input" className="!h-3 !w-3 !border-2 !border-surface-1 !bg-primary" />
      <div className="flex items-start gap-3 border-b border-border px-3 py-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-light text-primary">
          <Cpu size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{tDynamic(data.name)}</p>
          <p className="mt-1 truncate font-mono text-xs text-text-muted">{data.machineCode || data.id}</p>
        </div>
        <StatusBadge status={data.status} size="sm" />
      </div>
      <dl className="space-y-2 px-3 py-3 text-xs">
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1 text-text-muted"><Network size={13} aria-hidden="true" />{t('machines.table.plcConnected', { defaultValue: 'PLC' })}</dt>
          <dd className="font-medium text-text-primary">{data.plcConnected ? t('machines.plcConnected', { defaultValue: 'Connected' }) : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex items-center gap-1 text-text-muted"><Database size={13} aria-hidden="true" />{t('machines.productionCount', { defaultValue: 'Reported output' })}</dt>
          <dd className="font-mono font-medium text-text-primary">{hasProductionCount ? data.productionCount!.toLocaleString() : '—'}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-text-muted">IP</dt>
          <dd className="max-w-28 truncate font-mono text-text-primary">{data.ip || '—'}</dd>
        </div>
      </dl>
      <Handle type="source" position={Position.Right} id="output" className="!h-3 !w-3 !border-2 !border-surface-1 !bg-primary" />
    </div>
  );
}

export const MachineNode = memo(MachineNodeComponent);
export default MachineNode;
