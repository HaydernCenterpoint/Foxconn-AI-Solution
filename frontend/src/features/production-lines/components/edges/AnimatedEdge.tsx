import { useMemo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';

interface AnimatedEdgeData {
  animated?: boolean;
  label?: string;
}

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const EDGE_COLOR = readCssVar('--color-edge', 'var(--color-primary)');
const EDGE_COLOR_SELECTED = readCssVar('--color-edge-selected', 'var(--color-primary-hover)');

export function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
  style,
}: EdgeProps) {
  const [path, labelX, labelY] = useMemo(() => {
    // If wrapping to a new line (source is on the right, target is on the left, and sourceX >= targetX),
    // use SmoothStep path with large rounded corners to avoid cutting directly across/behind node boxes.
    if (sourcePosition === Position.Right && targetPosition === Position.Left && sourceX >= targetX - 40) {
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 24,
        offset: 30,
      });
    }

    return getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }, [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]);

  const edgeData = (data || {}) as AnimatedEdgeData;
  const isAnimated = edgeData.animated ?? true;

  if (!path) return null;

  const strokeColor = style?.stroke || (selected ? EDGE_COLOR_SELECTED : EDGE_COLOR);
  const strokeWidth = style?.strokeWidth || (selected ? 3 : 2.25);

  const marker = markerEnd;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={marker}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isAnimated ? '8 8' : undefined,
          filter: style?.filter as string | undefined,
        }}
        className={isAnimated ? 'animated-edge-flow' : undefined}
      />
      {edgeData.label && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-auto nodrag nopan rounded-full px-2 py-1 text-xs font-medium"
            style={{
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline-variant)',
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
