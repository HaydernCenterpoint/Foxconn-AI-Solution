import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDynamicTranslation } from '../../../shared/lib/translator';
import { X, Trash2 } from 'lucide-react';
import type { FlowNode } from '../store/flow.store';

interface Props {
  node: FlowNode | null;
  position: { x: number; y: number } | null;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function NodePropertiesBubbleComponent({ node, position, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (node) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [node, onClose]);

  if (!node || !position) {
    return null;
  }

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClose();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(node.id);
  };

  const statusColors: Record<string, string> = {
    running: 'var(--color-running)',
    idle: 'var(--color-idle)',
    error: 'var(--color-error)',
    maintenance: 'var(--color-accent)',
    stopped: 'var(--color-offline)',
  };

  const statusColor = statusColors[node.data.status ?? 'idle'] ?? 'var(--color-outline)';

  return (
    <div
      ref={bubbleRef}
      className="absolute z-50 min-w-64 rounded-xl border shadow-lg"
      style={{
        left: position.x + 20,
        top: position.y,
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-outline-variant)',
        boxShadow: 'var(--shadow-4)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {tDynamic(node.data.label)}
          </h3>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-lg p-1 transition-colors hover:bg-surface-container-low"
          style={{ color: 'var(--color-on-surface-variant)' }}
          aria-label={t('common.aria.close')}
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2 px-4 py-3">
        <div className="flex justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('flowDesigner.properties.type')}
          </span>
          <span className="text-xs font-medium capitalize" style={{ color: 'var(--color-on-surface)' }}>
            {node.data.nodeType}
          </span>
        </div>

        <div className="flex justify-between gap-4">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('flowDesigner.properties.status')}
          </span>
          <span className="text-xs font-medium capitalize" style={{ color: statusColor }}>
            {node.data.status || 'idle'}
          </span>
        </div>

        {node.data.ipAddress && (
          <div className="flex justify-between gap-4">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>IP</span>
            <span className="font-mono text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>
              {node.data.ipAddress}
            </span>
          </div>
        )}

        {node.data.description && (
          <div className="flex justify-between gap-4">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {t('flowDesigner.properties.description')}
            </span>
            <span className="max-w-32 truncate text-right text-xs" style={{ color: 'var(--color-on-surface)' }}>
              {tDynamic(node.data.description)}
            </span>
          </div>
        )}
      </div>

      <div
        className="border-t px-4 py-3"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <button
          type="button"
          onClick={handleDelete}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'var(--color-error-container)',
            color: 'var(--color-error)',
          }}
        >
          <Trash2 size={14} />
          {t('common.actions.delete')}
        </button>
      </div>
    </div>
  );
}

export const NodePropertiesBubble = memo(NodePropertiesBubbleComponent);
