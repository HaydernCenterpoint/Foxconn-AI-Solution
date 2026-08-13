import { memo } from 'react';
import { MaterialSymbol } from '../../../../shared/components/ui/MaterialSymbol';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';

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
  sequenceOrder?: number;
}

type MachineNodeProps = NodeProps<Node<MachineNodeData, 'machineNode'>>;

function MachineNodeComponent({ data, selected }: MachineNodeProps) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const hasProductionCount = typeof data.productionCount === 'number' && Number.isFinite(data.productionCount);
  const sequenceLabel = String(data.sequenceOrder ?? 1).padStart(2, '0');

  return (
    <div
      className={`line-flow-node ${selected ? 'line-flow-node--selected' : ''} ${data.plcConnected ? 'line-flow-node--connected' : 'line-flow-node--offline'}`}
      role="group"
      aria-label={`${tDynamic(data.name)} · ${data.machineCode || data.id}`}
    >
      <Handle type="target" position={Position.Left} id="input" className="line-flow-node__handle line-flow-node__handle--target" />
      <header className="line-flow-node__header">
        <span className="line-flow-node__sequence">#{sequenceLabel}</span>
        <span className="line-flow-node__machine-icon">
          <MaterialSymbol name="memory" size={17} />
        </span>
        <div className="line-flow-node__identity">
          <strong>{tDynamic(data.name)}</strong>
          <span>{data.machineCode || data.id}</span>
        </div>
        <StatusBadge status={data.status} size="sm" />
      </header>
      <dl className="line-flow-node__metrics">
        <div>
          <dt><MaterialSymbol name="lan" size={13} />{t('machines.table.plcConnected', { defaultValue: 'PLC' })}</dt>
          <dd className={data.plcConnected ? 'line-flow-node__value--positive' : 'line-flow-node__value--muted'}>
            {data.plcConnected
              ? t('machines.plcConnected', { defaultValue: 'Connected' })
              : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}
          </dd>
        </div>
        <div>
          <dt><MaterialSymbol name="database" size={13} />{t('machines.productionCount', { defaultValue: 'Reported output' })}</dt>
          <dd>{hasProductionCount ? data.productionCount!.toLocaleString() : '—'}</dd>
        </div>
        <div>
          <dt>IP</dt>
          <dd>{data.ip || '—'}</dd>
        </div>
      </dl>
      <Handle type="source" position={Position.Right} id="output" className="line-flow-node__handle line-flow-node__handle--source" />
    </div>
  );
}

export const MachineNode = memo(MachineNodeComponent);
export default MachineNode;
