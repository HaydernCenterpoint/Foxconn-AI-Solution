import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Cpu, Thermometer, Gauge, Zap, Clock, X } from 'lucide-react';
import { useDiagramStore, type DiagramNodeData } from '../store/diagram.store';
import { StatusBadge } from '../../../shared/components/ui/StatusBadge';
import { useDiagramInteraction } from './DiagramInteractionContext';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import { getStatusKey } from '../../../shared/lib/utils';

const EMPTY_EDGES: readonly never[] = [];

const HANDLE_COLOR = '#f59e0b'; // amber-500
const HANDLE_HITBOX = 18; // visual size
const HANDLE_HOVER_SCALE = 1.25;

type HandleId =
  | 'top' | 'right' | 'bottom' | 'left'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface HandleSpec {
  id: HandleId;
  position: Position;
  style: React.CSSProperties;
}

const HANDLE_SPECS: HandleSpec[] = [
  { id: 'top',          position: Position.Top,    style: { left: '50%',  top: 0,    transform: 'translate(-50%, -50%)' } },
  { id: 'right',        position: Position.Right,  style: { left: '100%', top: '50%', transform: 'translate(-50%, -50%)' } },
  { id: 'bottom',       position: Position.Bottom, style: { left: '50%',  top: '100%',transform: 'translate(-50%, -50%)' } },
  { id: 'left',         position: Position.Left,   style: { left: 0,      top: '50%', transform: 'translate(-50%, -50%)' } },
  { id: 'top-left',     position: Position.Top,    style: { left: 0,      top: 0,    transform: 'translate(-50%, -50%)' } },
  { id: 'top-right',    position: Position.Top,    style: { left: '100%', top: 0,    transform: 'translate(-50%, -50%)' } },
  { id: 'bottom-left',  position: Position.Bottom, style: { left: 0,      top: '100%',transform: 'translate(-50%, -50%)' } },
  { id: 'bottom-right', position: Position.Bottom, style: { left: '100%', top: '100%',transform: 'translate(-50%, -50%)' } },
];

function DiagramNodeInner({ id, data, selected }: NodeProps<Node<DiagramNodeData>>) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { onHandleDelete, readOnly } = useDiagramInteraction();
  const [hovered, setHovered] = useState(false);
  const [hoveredHandle, setHoveredHandle] = useState<HandleId | null>(null);
  const showHandles = (selected || hovered) && !readOnly;

  const edges = useDiagramStore((state) => {
    if (!data.lineId) return EMPTY_EDGES;
    return state.lineDiagrams[data.lineId]?.edges ?? EMPTY_EDGES;
  });

  const hasEdges = (handleId: HandleId) => {
    return edges.some(
      (edge) =>
        (edge.source === id && edge.sourceHandle === handleId) ||
        (edge.target === id && edge.targetHandle === handleId)
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'var(--color-running)';
      case 'idle': return 'var(--color-idle)';
      case 'error': return 'var(--color-error)';
      case 'stopped': return 'var(--color-warn)';
      case 'maintenance': return 'var(--color-information)';
      default: return 'var(--color-on-surface-variant)';
    }
  };

  const formatUptime = (seconds: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const hasSimulationData = data.temperature !== undefined || data.pressure !== undefined || data.speed !== undefined;

  const handleHandleMouseEnter = (e: React.MouseEvent, handleId: HandleId) => {
    e.stopPropagation();
    if (e.buttons > 0) return; // suppress hover visual while user is dragging a connection
    setHoveredHandle(handleId);
  };

  const handleHandleMouseLeave = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHoveredHandle(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, handleId: HandleId) => {
    e.stopPropagation();
    e.preventDefault();
    onHandleDelete(id, handleId);
    setHoveredHandle(null);
  };

  const statusKey = getStatusKey(data.status);

  return (
    <div
      className={`min-w-52 rounded-xl border transition-all duration-150 ${
        selected ? 'ring-2' : ''
      } ${!data.isEnabled ? 'opacity-60' : ''} group`}
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
        boxShadow: selected
          ? '0 0 0 3px rgba(26, 115, 232, 0.25), var(--shadow-3)'
          : 'var(--shadow-2)',
        color: 'var(--color-on-surface)',
        '--tw-ring-color': 'var(--color-primary)',
      } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {HANDLE_SPECS.map((spec) => {
        const isHandleHovered = hoveredHandle === spec.id;
        const handleHasEdges = hasEdges(spec.id);
        return (
          <div
            key={spec.id}
            className="absolute flex items-center justify-center"
            style={{
              ...spec.style,
              width: HANDLE_HITBOX,
              height: HANDLE_HITBOX,
              opacity: showHandles ? 1 : 0,
              transition: 'opacity 0.15s',
              pointerEvents: showHandles ? 'all' : 'none',
              zIndex: 10,
            }}
            onMouseEnter={(e) => handleHandleMouseEnter(e, spec.id)}
            onMouseLeave={handleHandleMouseLeave}
            onClick={() => setHoveredHandle(spec.id)}
          >
            <Handle
              id={spec.id}
              type="source"
              position={spec.position}
              isValidConnection={() => true}
              style={{
                background: HANDLE_COLOR,
                width: HANDLE_HITBOX * 0.66,
                height: HANDLE_HITBOX * 0.66,
                border: '2px solid var(--color-surface)',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) ${isHandleHovered ? `scale(${HANDLE_HOVER_SCALE})` : 'scale(1)'}`,
                transition: 'transform 0.12s',
                cursor: 'crosshair',
              }}
            />
            {isHandleHovered && handleHasEdges && (
              <button
                type="button"
                onClick={(e) => handleDeleteClick(e, spec.id)}
                className="nodrag nopan absolute flex items-center justify-center rounded-full"
                style={{
                  backgroundColor: 'var(--color-error)',
                  color: '#fff',
                  boxShadow: '0 0 0 2.25px var(--color-surface), 0 2px 6px rgba(0,0,0,0.25)',
                  cursor: 'pointer',
                  pointerEvents: 'all',
                  width: 14,
                  height: 14,
                  right: -5,
                  top: -5,
                  zIndex: 20,
                }}
                title={t('machinesPage.toast.deleteConnection', { defaultValue: 'Xóa các đường đã nối' })}
                aria-label={t('machinesPage.toast.deleteConnection', { defaultValue: 'Xóa các đường đã nối' })}
              >
                <X size={9} strokeWidth={3} />
              </button>
            )}
          </div>
        );
      })}

      {/* Header */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            backgroundColor: 'var(--color-surface-container-high)',
            color: 'var(--color-primary)',
          }}
        >
          <Cpu size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {tDynamic(data.equipmentName)}
          </p>
          <p
            className="truncate font-mono text-[11px]"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            {data.equipmentCode}
          </p>
        </div>
        <StatusBadge status={data.status} size="sm" />
      </div>

      {/* Body */}
      <div className="space-y-2 px-3 py-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: 'var(--color-on-surface-variant)' }}>IP</span>
          <span
            className="font-mono font-medium"
            style={{ color: 'var(--color-on-surface)' }}
          >
            {data.ipAddress || '-'}
          </span>
        </div>

        {data.lineName && (
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{t('machinesPage.properties.line')}</span>
            <span
              className="truncate text-right font-medium"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {tDynamic(data.lineName)}
            </span>
          </div>
        )}

        {typeof data.productionCount === 'number' && (
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{t('machinesPage.properties.output')}</span>
            <span
              className="font-mono font-semibold"
              style={{ color: 'var(--color-primary)' }}
            >
              {data.productionCount.toLocaleString()}
            </span>
          </div>
        )}

        {hasSimulationData && (
          <div
            className="mt-2 grid grid-cols-3 gap-2 rounded-lg p-2"
            style={{ backgroundColor: 'var(--color-surface-container-low)' }}
          >
            {typeof data.temperature === 'number' && (
              <div className="flex flex-col items-center gap-0.5" title={t('machinesPage.properties.temperature')}>
                <Thermometer size={12} style={{ color: getStatusColor(data.status) }} />
                <span className="font-mono text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>
                  {data.temperature.toFixed(1)}°
                </span>
              </div>
            )}
            {typeof data.pressure === 'number' && (
              <div className="flex flex-col items-center gap-0.5" title={t('machinesPage.properties.pressure')}>
                <Gauge size={12} style={{ color: 'var(--color-information)' }} />
                <span className="font-mono text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>
                  {data.pressure.toFixed(1)}
                </span>
              </div>
            )}
            {typeof data.speed === 'number' && (
              <div className="flex flex-col items-center gap-0.5" title={t('machinesPage.properties.speed')}>
                <Zap size={12} style={{ color: 'var(--color-warn)' }} />
                <span className="font-mono text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>
                  {data.speed.toFixed(0)}
                </span>
              </div>
            )}
          </div>
        )}

        {typeof data.uptimeSeconds === 'number' && (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              <Clock size={11} /> {t('machinesPage.properties.uptime')}
            </span>
            <span
              className="font-mono text-xs font-medium"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {formatUptime(data.uptimeSeconds)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const DiagramNode = memo(DiagramNodeInner);
export type { HandleId };
