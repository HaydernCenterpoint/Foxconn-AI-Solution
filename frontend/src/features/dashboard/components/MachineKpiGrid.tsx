import { fmt, fmtRuntime } from '../../../shared/lib/utils';
import { MetricMiniCard } from './MetricMiniCard';

interface Props {
  productionLabel: string;
  runtimeLabel: string;
  uptimeLabel: string;
  productionQty: number;
  runtimeSeconds: number;
  uptimeSeconds: number;
}

export function MachineKpiGrid({
  productionLabel,
  runtimeLabel,
  uptimeLabel,
  productionQty,
  runtimeSeconds,
  uptimeSeconds,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <MetricMiniCard label={productionLabel} value={fmt(productionQty)} tone="accent" />
      <MetricMiniCard label={runtimeLabel} value={fmtRuntime(runtimeSeconds)} tone="light" />
      <MetricMiniCard label={uptimeLabel} value={fmtRuntime(uptimeSeconds)} tone="light" />
    </div>
  );
}
