import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  Position,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';
import { X } from 'lucide-react';

interface ButtonEdgeData {
  animated?: boolean;
  label?: string;
}

export function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] =
    sourcePosition === Position.Right && targetPosition === Position.Left && sourceX >= targetX - 40
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
          borderRadius: 24,
          offset: 30,
        })
      : getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        });

  const edgeData = data as ButtonEdgeData | undefined;

  const onEdgeClick = useCallback(
    (evt: React.MouseEvent) => {
      evt.stopPropagation();
      setEdges((edges) => edges.filter((e) => e.id !== id));
    },
    [id, setEdges],
  );

  const showButton = selected || isHovered;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? 'var(--color-primary)' : 'var(--color-outline)',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: edgeData?.animated ? '5 5' : undefined,
        }}
        className={edgeData?.animated ? 'animated-edge-flow' : undefined}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <EdgeLabelRenderer>
        <div
          className="pointer-events-auto nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            opacity: showButton ? 1 : 0,
            transition: 'opacity 0.15s ease',
          }}
        >
          <button
            type="button"
            onClick={onEdgeClick}
            className="flex h-5 w-5 items-center justify-center rounded-full"
            style={{
              backgroundColor: 'var(--color-error)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            aria-label={t('flowDesigner.edges.delete')}
          >
            <X size={12} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
