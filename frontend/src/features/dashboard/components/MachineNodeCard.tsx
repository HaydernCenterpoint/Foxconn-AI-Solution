import type { Machine } from '../../machines/services/machines.api';
import { getStatusKey } from '../../../shared/lib/utils';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';

interface Props {
  machine: Machine;
  selected: boolean;
  onClick: () => void;
}

export function MachineNodeCard({ machine, selected, onClick }: Props) {
  const statusKey = getStatusKey(machine.status);
  const borderColor: Record<string, string> = {
    running: 'border-running',
    error: 'border-error',
    idle: 'border-idle',
    offline: 'border-outline',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-w-[130px] max-w-[150px] rounded-lg border-2 bg-surface-container-low p-3 text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
        borderColor[statusKey]
      } ${selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-bg' : ''}`}
    >
      <span className="absolute -top-2.5 left-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-white">
        {machine.sequenceOrder}
      </span>
      <p className="text-[11px] font-semibold leading-snug line-clamp-2 mb-2 mt-1 text-on-surface">{machine.name}</p>
      <StatusBadge status={machine.status} size="sm" />
    </button>
  );
}
