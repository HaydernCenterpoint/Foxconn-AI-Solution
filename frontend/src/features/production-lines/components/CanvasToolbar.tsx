import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, RotateCcw, Save, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  onFitView: () => void;
  onClearAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSave: () => void;
  onReset: () => void;
  nodeCount: number;
  edgeCount: number;
  isSaving?: boolean;
  hasUnsavedChanges?: boolean;
}

function CanvasToolbarComponent({
  onFitView,
  onClearAll,
  onZoomIn,
  onZoomOut,
  onSave,
  onReset,
  nodeCount,
  edgeCount,
  isSaving = false,
  hasUnsavedChanges = false,
}: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center justify-between border-b px-4 py-2"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-outline-variant)',
      }}
    >
      {/* Left: Title + stats */}
      <div className="flex items-center gap-3">
        <h2
          className="text-base font-semibold"
          style={{ color: 'var(--color-on-surface)' }}
        >
          {t('flowDesigner.title')}
        </h2>

        <div
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
          style={{
            backgroundColor: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <span>
            {t('flowDesigner.toolbar.nodes')}: {nodeCount}
          </span>
          <span className="mx-1">|</span>
          <span>
            {t('flowDesigner.toolbar.edges')}: {edgeCount}
          </span>
        </div>

        {/* Unsaved indicator */}
        {hasUnsavedChanges && (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium animate-pulse"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-idle) 15%, transparent)',
              color: 'var(--color-idle)',
              border: '1px solid color-mix(in srgb, var(--color-idle) 35%, transparent)',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {t('flowDesigner.toolbar.unsavedChanges')}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onZoomIn}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
            title={t('common.actions.zoomIn')}
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            onClick={onZoomOut}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
            title={t('common.actions.zoomOut')}
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            onClick={onFitView}
            className="rounded-lg p-1.5 transition-colors"
            style={{ color: 'var(--color-on-surface-variant)' }}
            title={t('common.actions.fitView')}
          >
            <Maximize2 size={16} />
          </button>
        </div>

        <div
          className="mx-1 h-6 w-px"
          style={{ backgroundColor: 'var(--color-outline-variant)' }}
        />

        {/* Danger: Clear All */}
        <button
          type="button"
          onClick={onClearAll}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: 'var(--color-error)' }}
          title={t('flowDesigner.toolbar.clearAll')}
        >
          <Trash2 size={14} />
          {t('flowDesigner.toolbar.clearAll')}
        </button>

        <div
          className="mx-1 h-6 w-px"
          style={{ backgroundColor: 'var(--color-outline-variant)' }}
        />

        {/* Reset */}
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
          style={{
            backgroundColor: 'var(--color-surface-container)',
            color: 'var(--color-on-surface-variant)',
            border: '1px solid var(--color-outline-variant)',
          }}
          title={t('flowDesigner.toolbar.reset')}
        >
          <RotateCcw size={14} />
          {t('flowDesigner.toolbar.reset')}
        </button>

        {/* Save */}
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: hasUnsavedChanges
              ? 'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 80%, var(--color-secondary)))'
              : 'var(--color-surface-container-high)',
            color: hasUnsavedChanges ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
            border: hasUnsavedChanges ? 'none' : '1px solid var(--color-outline-variant)',
            boxShadow: hasUnsavedChanges ? '0 2px 8px color-mix(in srgb, var(--color-primary) 35%, transparent)' : 'none',
          }}
        >
          <Save size={14} className={isSaving ? 'animate-spin' : ''} />
          {isSaving ? '...' : t('flowDesigner.toolbar.save')}
        </button>
      </div>
    </div>
  );
}

export const CanvasToolbar = memo(CanvasToolbarComponent);
