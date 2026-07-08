import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Search, WifiOff, LayoutGrid, List, Cpu, Thermometer, Lightbulb } from 'lucide-react';
import { machinesApi, type Machine, type MachineRequest } from '../services/machines.api';
import { linesApi } from '../../production-lines/services/lines.api';
import { queryKeys } from '../../../app/queryKeys';
import { queryTimings } from '../../../app/queryOptions';
import { EmptyState, LoadingState } from '../../../shared/components/ui/EmptyState';
import { useUiStore } from '../../../shared/store/ui.store';
import { ConfirmDialog } from '../../../shared/components/ui/ConfirmDialog';
import { useDynamicTranslation } from '../../../shared/lib/translator';

interface EquipmentFormData {
  name: string;
  machineCode: string;
  ip: string;
}

const initialFormData: EquipmentFormData = {
  name: '',
  machineCode: '',
  ip: '',
};

type EquipmentType = 'machine' | 'sensor' | 'light';

function getEquipmentType(machine: Machine): EquipmentType {
  const name = machine.name.toLowerCase();
  const code = (machine.machineCode || '').toLowerCase();
  const combined = `${name} ${code}`;

  if (combined.includes('sensor') || combined.includes('cảm biến') || combined.includes('cảm') || combined.includes('biến') || combined.includes('温感')) {
    return 'sensor';
  }
  if (combined.includes('light') || combined.includes('đèn') || combined.includes('灯') || combined.includes('signal') || combined.includes('còi') || combined.includes('buffer')) {
    return 'light';
  }
  return 'machine';
}

export function EquipmentTable() {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { addToast } = useUiStore();
  const queryClient = useQueryClient();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deleteMachine, setDeleteMachine] = useState<Machine | null>(null);
  const [formData, setFormData] = useState<EquipmentFormData>(initialFormData);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedLineId, setSelectedLineId] = useState<string>('');
  const [initialLineId, setInitialLineId] = useState<string>('');

  // Fetch machines
  const {
    data: machines,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.machines.list(),
    queryFn: machinesApi.getAll,
    refetchInterval: queryTimings.machines,
  });

  // Fetch production lines
  const { data: lines } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async ({ machineData, lineId }: { machineData: MachineRequest; lineId: string }) => {
      const createdMachine = await machinesApi.create(machineData);
      if (lineId) {
        await linesApi.addMachine(lineId, { machineId: createdMachine.id });
      }
      return createdMachine;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      addToast('success', t('equipment.table.toast.created'));
      closeModal();
    },
    onError: () => {
      addToast('error', t('equipment.table.toast.createError'));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, machineData, lineId, oldLineId }: { id: string; machineData: MachineRequest; lineId: string; oldLineId: string }) => {
      const result = await machinesApi.update(id, machineData);
      if (lineId !== oldLineId) {
        if (oldLineId) {
          try {
            await linesApi.removeMachine(oldLineId, id);
          } catch (e) {
            console.error('Failed to remove machine from old line:', e);
          }
        }
        if (lineId) {
          await linesApi.addMachine(lineId, { machineId: id });
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      addToast('success', t('equipment.table.toast.updated'));
      closeModal();
    },
    onError: () => {
      addToast('error', t('equipment.table.toast.updateError'));
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => machinesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.list() });
      addToast('success', t('equipment.table.toast.deleted'));
      setDeleteMachine(null);
    },
    onError: () => {
      addToast('error', t('equipment.table.toast.deleteError'));
    },
  });

  // Filter machines by search
  const filteredMachines = useMemo(() => {
    if (!machines) return [];
    const query = searchQuery.toLowerCase();
    return machines.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        (m.machineCode?.toLowerCase() || '').includes(query) ||
        (m.ip?.toLowerCase() || '').includes(query)
    );
  }, [machines, searchQuery]);

  const machinesByCategory = useMemo(() => {
    const machineList: Machine[] = [];
    const sensorList: Machine[] = [];
    const lightList: Machine[] = [];

    filteredMachines.forEach((m) => {
      const type = getEquipmentType(m);
      if (type === 'sensor') {
        sensorList.push(m);
      } else if (type === 'light') {
        lightList.push(m);
      } else {
        machineList.push(m);
      }
    });

    return {
      machine: machineList,
      sensor: sensorList,
      light: lightList,
    };
  }, [filteredMachines]);

  // Handlers
  const openCreateModal = () => {
    setEditingMachine(null);
    setFormData(initialFormData);
    setSelectedLineId('');
    setInitialLineId('');
    setIsModalOpen(true);
  };

  const openEditModal = (machine: Machine) => {
    setEditingMachine(machine);
    setFormData({
      name: machine.name,
      machineCode: machine.machineCode || '',
      ip: machine.ip || '',
    });
    
    // Find matching line by name
    const activeLine = lines?.find(l => {
      const names = (machine.lineNames || '').split(',').map(n => n.trim());
      return names.includes(l.name);
    });
    const lineId = activeLine ? activeLine.id : '';
    setInitialLineId(lineId);
    setSelectedLineId(lineId);
    
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMachine(null);
    setFormData(initialFormData);
    setSelectedLineId('');
    setInitialLineId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: MachineRequest = {
      name: formData.name,
      machineCode: formData.machineCode || undefined,
      ip: formData.ip || undefined,
    };

    if (editingMachine) {
      updateMutation.mutate({ id: editingMachine.id, machineData: data, lineId: selectedLineId, oldLineId: initialLineId });
    } else {
      createMutation.mutate({ machineData: data, lineId: selectedLineId });
    }
  };

  const handleDelete = () => {
    if (deleteMachine) {
      deleteMutation.mutate(deleteMachine.id);
    }
  };

  // Status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'var(--color-running)';
      case 'idle':
        return 'var(--color-idle)';
      case 'error':
        return 'var(--color-error)';
      case 'stopped':
        return 'var(--color-warn)';
      case 'maintenance':
        return 'var(--color-information)';
      default:
        return 'var(--color-on-surface-variant)';
    }
  };

  // Loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Error state
  if (isError) {
    return (
      <EmptyState
        icon={<WifiOff size={48} />}
        title={t('equipment.table.error.title')}
        description={t('equipment.table.error.description')}
      />
    );
  }

  const renderGridSection = (
    type: EquipmentType,
    items: Machine[],
    categoryIcon: React.ReactNode,
    categoryBgColor: string,
    categoryIconColor: string
  ) => {
    const title =
      type === 'machine'
        ? t('equipment.categories.machines', { defaultValue: 'Máy móc & Thiết bị' })
        : type === 'sensor'
        ? t('equipment.categories.sensors', { defaultValue: 'Cảm biến' })
        : t('equipment.categories.lights', { defaultValue: 'Đèn & Tín hiệu' });

    return (
      <div className="space-y-3">
        {/* Section Title */}
        <div className="flex items-center gap-2 border-b pb-2" style={{ borderColor: 'var(--color-outline-variant)' }}>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: categoryBgColor,
              color: categoryIconColor,
            }}
          >
            {categoryIcon}
          </div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
            {title}
          </h2>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            {items.length}
          </span>
        </div>

        {/* Grid Items */}
        {items.length === 0 ? (
          <p className="text-xs italic pl-2 py-2" style={{ color: 'var(--color-on-surface-variant)' }}>
            {t('equipment.categories.empty', { defaultValue: 'Không có thiết bị thuộc mục này.' })}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((machine) => {
              const statusColor = getStatusColor(machine.status);
              return (
                <div
                  key={machine.id}
                  className="flex flex-col justify-between rounded-xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-outline-variant)',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <div>
                    {/* Card Top: Status Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: statusColor }}
                        />
                        {machine.status}
                      </span>
                    </div>

                    {/* Card Middle: Info */}
                    <h3
                      className="font-semibold text-sm line-clamp-1 mb-1"
                      title={tDynamic(machine.name)}
                      style={{ color: 'var(--color-on-surface)' }}
                    >
                      {tDynamic(machine.name)}
                    </h3>
                    <p
                      className="font-mono text-[11px] mb-3 text-ellipsis overflow-hidden whitespace-nowrap"
                      style={{ color: 'var(--color-on-surface-variant)' }}
                    >
                      {machine.machineCode || '-'}
                    </p>

                    {/* Card Details */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>IP</span>
                        <span className="font-mono text-right font-medium" style={{ color: 'var(--color-on-surface)' }}>
                          {machine.ip || '-'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span style={{ color: 'var(--color-on-surface-variant)' }}>
                          {t('equipment.table.columns.lines')}
                        </span>
                        <span
                          className="truncate max-w-[150px] text-right font-medium"
                          style={{ color: 'var(--color-on-surface)' }}
                          title={machine.lineNames ? tDynamic(machine.lineNames) : '-'}
                        >
                          {machine.lineNames ? tDynamic(machine.lineNames) : '-'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Actions */}
                  <div
                    className="mt-4 pt-3 flex justify-end gap-1.5 border-t"
                    style={{ borderColor: 'var(--color-outline-variant)' }}
                  >
                    <button
                      onClick={() => openEditModal(machine)}
                      className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
                      style={{ color: 'var(--color-primary)' }}
                      title={t('equipment.table.actions.edit')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeleteMachine(machine)}
                      className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
                      style={{ color: 'var(--color-error)' }}
                      title={t('equipment.table.actions.delete')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2"
            size={18}
            style={{ color: 'var(--color-on-surface-variant)' }}
          />
          <input
            type="text"
            placeholder={t('equipment.table.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border py-2 pl-10 pr-4 transition-colors focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-outline-variant)',
              color: 'var(--color-on-surface)',
            }}
          />
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {/* View Mode Toggle */}
          <div
            className="flex items-center gap-1 rounded-lg border p-1"
            style={{
              borderColor: 'var(--color-outline-variant)',
              backgroundColor: 'var(--color-surface-container-low)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded p-1.5 transition-all duration-200 ${
                viewMode === 'grid'
                  ? 'shadow-sm bg-[var(--color-surface)] text-[var(--color-primary)] opacity-100'
                  : 'opacity-60 hover:opacity-100 text-[var(--color-on-surface)]'
              }`}
              title={t('common.view.grid', { defaultValue: 'Xem dạng ô' })}
            >
              <LayoutGrid size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded p-1.5 transition-all duration-200 ${
                viewMode === 'list'
                  ? 'shadow-sm bg-[var(--color-surface)] text-[var(--color-primary)] opacity-100'
                  : 'opacity-60 hover:opacity-100 text-[var(--color-on-surface)]'
              }`}
              title={t('common.view.list', { defaultValue: 'Xem dạng bảng' })}
            >
              <List size={18} />
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
            }}
          >
            <Plus size={18} />
            {t('equipment.table.add')}
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        /* Table View */
        <div
          className="flex-1 overflow-auto rounded-lg border"
          style={{ borderColor: 'var(--color-outline-variant)' }}
        >
          <table className="w-full">
            <thead
              className="sticky top-0"
              style={{ backgroundColor: 'var(--color-surface-container-low)' }}
            >
              <tr>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.name')}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.code')}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.ip')}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.status')}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.lines')}
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-semibold"
                  style={{ color: 'var(--color-on-surface)' }}
                >
                  {t('equipment.table.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMachines.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center"
                    style={{ color: 'var(--color-on-surface-variant)' }}
                  >
                    {searchQuery
                      ? t('equipment.table.empty.search')
                      : t('equipment.table.empty.noData')}
                  </td>
                </tr>
              ) : (
                filteredMachines.map((machine) => (
                  <tr
                    key={machine.id}
                    className="border-t transition-colors hover:bg-black/5"
                    style={{ borderColor: 'var(--color-outline-variant)' }}
                  >
                    <td className="px-4 py-3">
                      <span style={{ color: 'var(--color-on-surface)' }}>{tDynamic(machine.name)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-sm"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {machine.machineCode || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-sm"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {machine.ip || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: `${getStatusColor(machine.status)}20`,
                          color: getStatusColor(machine.status),
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: getStatusColor(machine.status) }}
                        />
                        {machine.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-sm"
                        style={{ color: 'var(--color-on-surface-variant)' }}
                      >
                        {machine.lineNames ? tDynamic(machine.lineNames) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(machine)}
                          className="rounded p-1.5 transition-colors hover:bg-black/10"
                          style={{ color: 'var(--color-primary)' }}
                          title={t('equipment.table.actions.edit')}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteMachine(machine)}
                          className="rounded p-1.5 transition-colors hover:bg-black/10"
                          style={{ color: 'var(--color-error)' }}
                          title={t('equipment.table.actions.delete')}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Categorized Grid View */
        <div className="flex-1 overflow-auto space-y-8 pr-1">
          {filteredMachines.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center"
              style={{
                borderColor: 'var(--color-outline-variant)',
                color: 'var(--color-on-surface-variant)',
                backgroundColor: 'var(--color-surface)',
              }}
            >
              <WifiOff size={48} className="mb-3 opacity-60" />
              <p className="text-sm">
                {searchQuery
                  ? t('equipment.table.empty.search')
                  : t('equipment.table.empty.noData')}
              </p>
            </div>
          ) : (
            <>
              {/* Category 1: Machine */}
              {renderGridSection(
                'machine',
                machinesByCategory.machine,
                <Cpu size={18} />,
                '#3b82f615',
                'var(--color-primary)'
              )}

              {/* Category 2: Sensor */}
              {renderGridSection(
                'sensor',
                machinesByCategory.sensor,
                <Thermometer size={18} />,
                '#f59e0b15',
                '#f59e0b'
              )}

              {/* Category 3: Light */}
              {renderGridSection(
                'light',
                machinesByCategory.light,
                <Lightbulb size={18} />,
                '#a855f715',
                '#a855f7'
              )}
            </>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="rounded-xl p-6 shadow-xl border flex flex-col gap-4"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-outline-variant)',
              width: '450px',
              maxWidth: '95%',
            }}
          >
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--color-on-surface)' }}
            >
              {editingMachine
                ? t('equipment.table.modal.editTitle')
                : t('equipment.table.modal.createTitle')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {t('equipment.table.form.name')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-outline-variant)',
                    color: 'var(--color-on-surface)',
                  }}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {t('equipment.table.form.code')}
                </label>
                <input
                  type="text"
                  value={formData.machineCode}
                  onChange={(e) => setFormData({ ...formData, machineCode: e.target.value })}
                  className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-outline-variant)',
                    color: 'var(--color-on-surface)',
                  }}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {t('equipment.table.form.ip')}
                </label>
                <input
                  type="text"
                  value={formData.ip}
                  onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                  placeholder="192.168.1.1"
                  className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-colors focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-outline-variant)',
                    color: 'var(--color-on-surface)',
                  }}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-on-surface-variant)' }}
                >
                  {t('equipment.fields.line', { defaultValue: 'Dây chuyền' })}
                </label>
                <select
                  value={selectedLineId}
                  onChange={(e) => setSelectedLineId(e.target.value)}
                  className="w-full rounded-lg border px-3.5 py-2.5 text-sm transition-all focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-outline-variant)',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <option value="">{t('equipment.form.selectLinePlaceholder', { defaultValue: '-- Không chọn --' })}</option>
                  {lines?.map((line) => (
                    <option key={line.id} value={line.id}>
                      {tDynamic(line.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2 transition-colors hover:bg-black/5"
                  style={{
                    backgroundColor: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {t('common.actions.cancel')}
                </button>
                <button
                  type="submit"
                  className="rounded-lg px-4 py-2 font-medium transition-colors hover:opacity-90"
                  style={{
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-on-primary)',
                  }}
                >
                  {editingMachine ? t('common.actions.save') : t('common.actions.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteMachine}
        onCancel={() => setDeleteMachine(null)}
        onConfirm={handleDelete}
        title={t('equipment.table.delete.title')}
        description={t('equipment.table.delete.message', { name: deleteMachine?.name })}
        confirmLabel={t('common.actions.delete')}
        cancelLabel={t('common.actions.cancel')}
        confirmTone="danger"
      />
    </div>
  );
}
