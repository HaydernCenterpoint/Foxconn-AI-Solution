import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu } from 'lucide-react';
import { useFlowStore, type LibraryItem } from '../store/flow.store';
import { simulatorStore } from '../../simulation/services/mockSimulator.service';
import { useDynamicTranslation } from '../../../shared/lib/translator';

interface Props {
  onDragStart: (event: React.DragEvent, item: LibraryItem) => void;
}

function EquipmentLibraryComponent({ onDragStart }: Props) {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const {
    usedLibraryIds,
    selectedLineFilter,
    setSelectedLineFilter,
  } = useFlowStore();

  const state = simulatorStore.getState();
  const allMachines = state.machines;
  const allLines = state.lines;

  const libraryItems: LibraryItem[] = allMachines.map((machine) => ({
    id: machine.id,
    name: machine.name,
    code: machine.id,
    ip: `192.168.1.${machine.id.split('-')[1]?.charCodeAt(0) || '10'}`,
    lineId: machine.lineId,
    status: machine.status,
  }));

  const filteredItems = selectedLineFilter === 'all'
    ? libraryItems
    : libraryItems.filter((item) => item.lineId === selectedLineFilter);

  const availableItems = filteredItems.filter((item) => !usedLibraryIds.has(item.id));
  const usedItems = filteredItems.filter((item) => usedLibraryIds.has(item.id));

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
    <div
      className="flex h-full w-72 flex-col overflow-hidden"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderRight: '1px solid var(--color-outline-variant)',
      }}
    >
      <div
        className="border-b p-4"
        style={{ borderColor: 'var(--color-outline-variant)' }}
      >
        <div className="mb-3 flex items-center gap-2">
          <Cpu size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {t('flowDesigner.palette.equipmentLibrary')}
          </h2>
        </div>

        <select
          className="field text-xs"
          value={selectedLineFilter}
          onChange={(e) => setSelectedLineFilter(e.target.value)}
        >
          <option value="all">{t('flowDesigner.palette.allLines')}</option>
          {allLines.map((line) => (
            <option key={line.id} value={line.id}>
              {tDynamic(line.name)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {availableItems.length === 0 ? (
            <p className="p-4 text-center text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
              {t('flowDesigner.palette.noAvailable')}
            </p>
          ) : (
            availableItems.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className="group cursor-grab rounded-lg border p-3 transition-all duration-150 active:cursor-grabbing hover:border-primary/50 hover:shadow-sm"
                style={{
                  backgroundColor: 'var(--color-surface-container-low)',
                  borderColor: 'var(--color-outline-variant)',
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      {tDynamic(item.name)}
                    </p>
                    <p
                      className="mt-0.5 truncate font-mono text-[10px]"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {item.code}
                    </p>
                    <p
                      className="mt-0.5 truncate font-mono text-[10px]"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {item.ip}
                    </p>
                  </div>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: getStatusColor(item.status) }}
                    title={item.status}
                  />
                </div>
              </div>
            ))
          )}

          {usedItems.length > 0 && (
            <>
              <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--color-outline-variant)' }}>
                <p className="mb-2 text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {t('flowDesigner.palette.onCanvas')} ({usedItems.length})
                </p>
                {usedItems.map((item) => (
                  <div
                    key={item.id}
                    className="mb-2 rounded-lg border border-dashed p-2 opacity-50"
                    style={{
                      backgroundColor: 'var(--color-surface-container-low)',
                      borderColor: 'var(--color-outline-variant)',
                    }}
                  >
                    <p
                      className="truncate text-xs font-medium"
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      {tDynamic(item.name)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const EquipmentLibrary = memo(EquipmentLibraryComponent);
