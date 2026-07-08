import { ProgressBar } from '../../../shared/components/ui/ProgressBar';

interface Props {
  cpu: number;
  ram: number;
  compact?: boolean;
}

export function MachineTelemetryBars({ cpu, ram, compact = false }: Props) {
  if (compact) {
    return (
      <div className="space-y-2 min-w-[112px]">
        <div className="flex items-center gap-2">
          <ProgressBar value={cpu} color="accent" />
          <span className="text-[11px] text-muted w-8 text-right">{cpu}%</span>
        </div>
        <div className="flex items-center gap-2">
          <ProgressBar value={ram} color="warn" />
          <span className="text-[11px] text-muted w-8 text-right">{ram}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>CPU</span>
        <span>{cpu}%</span>
      </div>
      <ProgressBar value={cpu} color="accent" />
      <div className="flex justify-between text-xs text-muted mb-1 mt-2">
        <span>RAM</span>
        <span>{ram}%</span>
      </div>
      <ProgressBar value={ram} color="warn" />
    </div>
  );
}
