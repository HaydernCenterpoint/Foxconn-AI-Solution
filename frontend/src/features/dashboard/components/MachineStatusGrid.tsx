import { memo } from 'react';
import type { MockMachine } from '../../simulation/services/mockSimulator.service';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { useDynamicTranslation } from '../../../shared/lib/translator';

interface Props {
  machines: MockMachine[];
  onMachineClick?: (machine: MockMachine) => void;
}

function MachineStatusGridComponent({ machines, onMachineClick }: Props) {
  const { tDynamic } = useDynamicTranslation();
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'var(--color-running)';
      case 'idle':
        return 'var(--color-idle)';
      case 'error':
        return 'var(--color-error)';
      case 'maintenance':
        return 'var(--color-accent)';
      default:
        return 'var(--color-offline)';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {machines.map((machine) => (
        <button
          key={machine.id}
          type="button"
          onClick={() => onMachineClick?.(machine)}
          className="group rounded-lg border p-3 text-left transition-all duration-150 hover:shadow-md"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: getStatusColor(machine.status),
            borderWidth: '2px',
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: getStatusColor(machine.status) }}
            />
            <span className="font-mono text-[10px]" style={{ color: 'var(--color-on-surface-variant)' }}>
              {machine.displayId ?? machine.id}
            </span>
          </div>
          <p
            className="truncate text-sm font-medium"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {tDynamic(machine.name)}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <StatusBadge status={machine.status} size="sm" />
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>
              {machine.productionCount}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export const MachineStatusGrid = memo(MachineStatusGridComponent);
