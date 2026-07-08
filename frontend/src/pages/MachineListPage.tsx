import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { machinesApi } from '../features/machines/services/machines.api';
import { linesApi } from '../features/production-lines/services/lines.api';
import type { Machine } from '../shared/types/machine';
import {
  Plus,
  Search,
  Check,
  Eye,
  Edit3,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../shared/components/ui/Modal';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { TechPanel } from '../shared/components/ui/TechPanel';
import { useDynamicTranslation } from '../shared/lib/translator';
import { usePermissions } from '../shared/hooks/usePermissions';

export const MachineListPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canCreate } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const initialStatus = searchParams.get('status') || '';
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);

  const [machineName, setMachineName] = useState('');
  const [machineCode, setMachineCode] = useState('');
  const [machineIp, setMachineIp] = useState('');
  const [clientId, setClientId] = useState('');
  const [lineId, setLineId] = useState<string>('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const statusParam = searchParams.get('status') || '';
    setStatusFilter(statusParam);
  }, [searchParams]);

  const handleStatusFilterChange = (val: string) => {
    setStatusFilter(val);
    if (val) {
      setSearchParams({ status: val });
    } else {
      setSearchParams({});
    }
  };

  const { data: lines } = useQuery({
    queryKey: ['productionLines-shared'],
    queryFn: linesApi.getAll,
  });

  const { data: machinesData, isLoading } = useQuery({
    queryKey: ['machines-list-shared'],
    queryFn: machinesApi.getAll,
    refetchInterval: 2000,
  });
  const machines = machinesData as Machine[] | undefined;

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await machinesApi.approve(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await machinesApi.revoke(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
    },
  });

  const createMachineMutation = useMutation({
    mutationFn: async (newMachine: any) => {
      await machinesApi.create(newMachine);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
      closeForm();
    },
    onError: (err: any) => {
      if (err.response && err.response.data && err.response.data.error) {
        setFormError(err.response.data.error);
      } else {
        setFormError(t('common.errors.unknown', 'Lỗi không xác định'));
      }
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await machinesApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
      closeForm();
    },
    onError: (err: any) => {
      if (err.response && err.response.data && err.response.data.error) {
        setFormError(err.response.data.error);
      } else {
        setFormError(t('common.errors.unknown', 'Lỗi không xác định'));
      }
    },
  });

  const deleteMachineMutation = useMutation({
    mutationFn: async (id: string) => {
      await machinesApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
    },
  });

  const handleEditClick = (m: Machine) => {
    setEditingMachineId(m.id);
    setMachineName(m.name);
    setMachineCode(m.machineCode || '');
    setMachineIp(m.ip || '');
    setClientId(m.clientId || '');
    setLineId('');
    setFormError('');
    setShowAddForm(true);
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingMachineId(null);
    setMachineName('');
    setMachineCode('');
    setMachineIp('');
    setClientId('');
    setLineId('');
    setFormError('');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineName) return;

    if (editingMachineId) {
      updateMachineMutation.mutate({
        id: editingMachineId,
        data: {
          name: machineName,
          machineCode: machineCode || undefined,
          ip: machineIp || undefined,
          clientId: clientId || undefined,
          lineId: lineId || undefined,
        },
      });
    } else {
      createMachineMutation.mutate({
        name: machineName,
        machineCode: machineCode || undefined,
        ip: machineIp || undefined,
        clientId: clientId || undefined,
        lineId: lineId || undefined,
      });
    }
  };

  const filteredMachines = (machines || []).filter(m => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.machineCode || '').toLowerCase().includes(search.toLowerCase()) ||
      (m.ip || '').includes(search);
    const matchesStatus = !statusFilter || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-white">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary uppercase flex items-center gap-3">
            <span className="h-3.5 w-3.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
            {t('machines.title', 'Cấu hình thiết bị')}
          </h1>
          <p className="mt-2 text-base text-text-secondary">{t('machines.adminSubtitle', 'Quản lý, tạo mới, phê duyệt trạng thái kết nối PLC Client và phân chuyền.')}</p>
        </div>

        {canCreate && (
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00ADB5] hover:bg-[#00ADB5]/80 px-4 py-2.5 font-bold text-white transition-colors self-end sm:self-auto cursor-pointer text-sm shadow-[0_0_12px_rgba(0,173,181,0.35)]"
          >
            <Plus size={18} />
            {t('machines.add', 'Thêm thiết bị')}
          </button>
        )}
      </div>

      {/* Filter widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400/80" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('machines.searchPlaceholder', 'Tìm tên máy, mã trạm, IP...')}
            className="w-full rounded-lg border border-[#14356a] bg-[#0A1129]/80 py-2 pl-10 pr-4 text-sm text-text-primary outline-none focus:border-cyan-500 text-white placeholder-text-muted"
          />
        </div>

        <Dropdown
          value={statusFilter}
          onChange={handleStatusFilterChange}
          options={[
            { value: '', label: t('machines.filterAllStatus', 'Tất cả trạng thái') },
            { value: 'running', label: t('status.running', 'ĐANG CHẠY') },
            { value: 'idle', label: t('status.idle', 'CHỜ') },
            { value: 'error', label: t('status.error', 'LỖI') },
            { value: 'offline', label: t('status.offline', 'MẤT KẾT NỐI') },
          ]}
        />
      </div>

      {/* Form Modal (Add/Edit) */}
      {canCreate && (
        <Modal
          open={showAddForm}
          onClose={closeForm}
          title={editingMachineId ? t('machines.editModal.title', 'Cập nhật thiết bị') : t('machines.addModal.title', 'Tạo thiết bị mới')}
          size="md"
          footer={
            <>
              <button type="button" onClick={closeForm} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-3">
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                form="machine-form"
                disabled={createMachineMutation.isPending || updateMachineMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {createMachineMutation.isPending || updateMachineMutation.isPending ? t('common.status.loading') : t('common.actions.save')}
              </button>
            </>
          }
        >
          <form id="machine-form" onSubmit={handleFormSubmit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-error bg-error-container px-3 py-2.5 text-xs text-error">{formError}</div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Tên thiết bị *</label>
              <input
                type="text"
                value={machineName}
                onChange={(e) => setMachineName(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Mã trạm</label>
              <input
                type="text"
                value={machineCode}
                onChange={(e) => setMachineCode(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">IP Connection</label>
              <input
                type="text"
                value={machineIp}
                onChange={(e) => setMachineIp(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Client ID (PLC client)</label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            {!editingMachineId && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Gán vào dây chuyền</label>
                <select
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
                >
                  <option value="">-- Chọn dây chuyền --</option>
                  {lines && lines.map((l) => (
                    <option key={l.id} value={l.id}>{tDynamic(l.name)}</option>
                  ))}
                </select>
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Grid TechPanel List Table */}
      <TechPanel title={t('machines.listTitle', 'Danh sách thiết bị kết nối')}>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-cyan-500/25 border-t-cyan-400" />
            <span className="text-sm font-bold text-cyan-400/80">{t('machines.loading', 'Đang tải thông tin thiết bị...')}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text-secondary border-collapse">
              <thead>
                <tr className="border-b border-[#14356a]/65 text-xs uppercase tracking-wider text-text-muted bg-[#070c1e]/40">
                  <th className="py-3 px-4 font-bold">{t('machines.table.name', 'Thiết bị')}</th>
                  <th className="py-3 px-4 font-bold">{t('machines.table.code', 'Mã trạm')}</th>
                  <th className="py-3 px-4 font-bold">{t('machines.table.ip', 'IP Connection')}</th>
                  <th className="py-3 px-4 font-bold text-center">{t('machines.table.status', 'Trạng thái')}</th>
                  <th className="py-3 px-4 font-bold text-center">{t('machines.table.serverConnected', 'Server Connected')}</th>
                  <th className="py-3 px-4 font-bold text-center">{t('machines.table.plcConnected', 'PLC Connected')}</th>
                  <th className="py-3 px-4 font-bold text-center">{t('machines.table.approval', 'Phê duyệt')}</th>
                  <th className="py-3 px-4 font-bold text-center">{t('machines.table.actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14356a]/30">
                {filteredMachines.length > 0 ? (
                  filteredMachines.map((m) => (
                    <tr key={m.id} className="hover:bg-[#070c1e]/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-[#EEEEEE]">{tDynamic(m.name)}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-cyan-400/90">{m.machineCode || 'N/A'}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-text-secondary">{m.ip || 'N/A'}</td>
                      <td className="py-3.5 px-4 text-center">
                        <StatusBadge status={m.status as any} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          m.status !== 'offline' && m.status !== 'OFFLINE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {m.status !== 'offline' && m.status !== 'OFFLINE' ? t('machines.status.serverConnected', 'ĐANG KẾT NỐI') : t('machines.status.serverDisconnected', 'KHÔNG KẾT NỐI')}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          m.plcConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {m.plcConnected ? 'CONNECTED' : 'DISCONNECTED'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {canCreate ? (
                          m.approvalStatus === 'PENDING' ? (
                            <button
                              onClick={() => approveMutation.mutate(m.id)}
                              className="p-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 transition-all active:scale-95 cursor-pointer shadow-[0_0_8px_rgba(16,185,129,0.25)]"
                              title={t('common.actions.approve', 'Phê duyệt')}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => revokeMutation.mutate(m.id)}
                              className="px-2.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] font-black hover:bg-rose-500/20 transition-all active:scale-95 cursor-pointer shadow-[0_0_8px_rgba(239,68,68,0.2)]"
                              title={t('common.actions.revoke', 'Thu hồi phê duyệt')}
                            >
                              REVOKE
                            </button>
                          )
                        ) : (
                          <span className={`text-[10px] font-black tracking-wider ${m.approvalStatus === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {m.approvalStatus || 'PENDING'}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => navigate(`/machines/${m.id}`)}
                            className="p-1.5 rounded-lg border border-[#14356a] hover:bg-cyan-500/10 text-cyan-400 transition-all active:scale-95 cursor-pointer"
                            title={t('common.actions.view', 'Xem chi tiết')}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canCreate && (
                            <>
                              <button
                                onClick={() => handleEditClick(m)}
                                className="p-1.5 rounded-lg border border-[#14356a] hover:bg-cyan-500/10 text-cyan-400 transition-all active:scale-95 cursor-pointer"
                                title={t('common.actions.edit', 'Sửa thông tin')}
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(t('common.confirm.delete', 'Bạn có chắc chắn muốn xóa?'))) {
                                    deleteMachineMutation.mutate(m.id);
                                  }
                                }}
                                className="p-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 text-red-400 transition-all active:scale-95 cursor-pointer"
                                title={t('common.actions.delete', 'Xóa')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-text-muted">
                      {t('common.table.noData', 'Không có dữ liệu')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </TechPanel>
    </div>
  );
};
export default MachineListPage;
