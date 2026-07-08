import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, WifiOff, Plus } from 'lucide-react';
import { linesApi, type LineRequest, type ProductionLine } from '../features/production-lines/services/lines.api';
import { queryKeys } from '../app/queryKeys';
import { queryTimings } from '../app/queryOptions';
import { EmptyState } from '../shared/components/ui/EmptyState';
import { DiagramEditor } from '../features/production-lines/components/DiagramEditor';
import { useDynamicTranslation } from '../shared/lib/translator';
import { Modal } from '../shared/components/ui/Modal';
import { Badge } from '../shared/components/ui/Badge';
import { usePermissions } from '../shared/hooks/usePermissions';
import type { Machine } from '../features/machines/services/machines.api';
import { SharedDashboardPage } from '../features/dashboard/components/SharedDashboardPage';

export default function LinesPage() {
  const { t } = useTranslation();
  const { canEdit, canCreate, isViewer } = usePermissions();

  if (isViewer) {
    return <SharedDashboardPage role="viewer" hideBottomCharts={true} />;
  }

  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [newLineDescription, setNewLineDescription] = useState('');

  const queryClient = useQueryClient();
  const createLineMutation = useMutation({
    mutationFn: (data: LineRequest) => linesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lines.list() });
      setIsCreateModalOpen(false);
      setNewLineName('');
      setNewLineDescription('');
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: (id: string) => linesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.lines.list() });
    },
  });

  const handleCreateLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineName) return;
    createLineMutation.mutate({
      name: newLineName,
      description: newLineDescription || undefined,
    });
  };

  const {
    data: lines,
    isLoading,
    isError,
  } = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  const handleSelectLine = (line: ProductionLine) => {
    setSelectedLine(line);
  };

  const handleBackToList = () => {
    setSelectedLine(null);
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 size={40} className="animate-spin text-[#00ADB5]" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<WifiOff size={56} />}
        title={t('linesPage.error.title')}
        description={t('linesPage.error.description')}
      />
    );
  }

  if (selectedLine) {
    return (
      <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-[#14356a] bg-[#060a16] shadow-2xl">
        <DiagramEditor
          lineId={selectedLine.id}
          readOnly={!canEdit}
          onClose={handleBackToList}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-text-primary">{t('linesPage.title', 'Dây chuyền lắp ráp')}</h1>
          <p className="mt-2 text-base text-text-secondary">{t('linesPage.description', 'Quản lý danh sách dây chuyền lắp ráp và chỉnh sửa sơ đồ kết nối PLC.')}</p>
        </div>

        {canCreate && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00ADB5] hover:bg-[#00ADB5]/80 px-4 py-2.5 font-bold text-white transition-colors self-end sm:self-auto cursor-pointer text-sm shadow-[0_0_12px_rgba(0,173,181,0.35)]"
          >
            <Plus size={18} />
            {t('linesPage.add', { defaultValue: 'Thêm dây chuyền' })}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto pr-1 bg-[#0A1129]/40 border border-[#14356a] rounded-xl shadow-2xl mb-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#14356a] bg-[#101625]/85">
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-16">STT</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider">Tên dây chuyền</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-28">Số máy</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-28">Trạng thái</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-28">OEE Chuyền</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-36">Sản lượng</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-32">Tốc độ UPH</th>
              <th className="px-6 py-4.5 text-[11px] font-black text-[#00ADB5] uppercase tracking-wider text-center w-28">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {lines && lines.length > 0 ? (
              lines.map((line, index) => (
                <LineRow
                  key={line.id}
                  index={index}
                  line={line}
                  onClick={() => handleSelectLine(line)}
                  onDelete={(id) => deleteLineMutation.mutate(id)}
                  canDelete={canCreate}
                />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm font-bold text-text-secondary">
                  {t('linesPage.emptyTable', 'Chưa có dây chuyền sản xuất nào được cấu hình.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canCreate && (
        <Modal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title={t('linesPage.createModal.title', { defaultValue: 'Tạo dây chuyền mới' })}
          size="md"
          footer={
            <>
              <button type="button" onClick={() => setIsCreateModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-3">
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                form="line-form"
                disabled={createLineMutation.isPending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {createLineMutation.isPending ? t('common.status.loading') : t('common.actions.create')}
              </button>
            </>
          }
        >
          <form id="line-form" onSubmit={handleCreateLineSubmit} className="space-y-4">
            {createLineMutation.isError && (
              <div className="rounded-lg border border-error bg-error-container px-3.5 py-2.5 text-xs text-error">
                {t('common.errors.unknown', 'Có lỗi xảy ra khi tạo dây chuyền')}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('linesPage.createModal.form.name', { defaultValue: 'Tên dây chuyền' })}
              </label>
              <input
                type="text"
                value={newLineName}
                onChange={(e) => setNewLineName(e.target.value)}
                required
                placeholder={t('linesPage.createModal.form.namePlaceholder', { defaultValue: 'e.g. MKZ Auto Line' })}
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-text-secondary">
                {t('linesPage.createModal.form.description', { defaultValue: 'Mô tả' })}
              </label>
              <textarea
                value={newLineDescription}
                onChange={(e) => setNewLineDescription(e.target.value)}
                placeholder={t('linesPage.createModal.form.descriptionPlaceholder', { defaultValue: 'e.g. Luồng lắp ráp cho nhóm trạm A' })}
                rows={3}
                className="w-full rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-sm text-text-primary outline-none focus:border-primary resize-none"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

interface LineRowProps {
  index: number;
  line: ProductionLine;
  onClick: () => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
}

function LineRow({ index, line, onClick, onDelete, canDelete }: LineRowProps) {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();

  const getStatusVariant = (status: string | undefined): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
    switch (status) {
      case 'active':
        return 'success';
      case 'maintenance':
        return 'warning';
      default:
        return 'neutral';
    }
  };

  const { data: machines } = useQuery({
    queryKey: ['line-machines', line.id],
    queryFn: () => linesApi.getMachines(line.id),
    refetchInterval: 2000,
  });

  const sortedMachines = [...(machines || [])].sort((a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0));
  const lastMachine = sortedMachines.length > 0 ? sortedMachines[sortedMachines.length - 1] : null;

  const locale = i18n.language === 'zh' ? 'zh-CN' : (i18n.language === 'en' ? 'en-US' : 'vi-VN');

  const getLineMetrics = (m: Machine | null) => {
    if (!m) return { lineOee: 0, lineOutput: 0, lineUph: 0, isError: false, isRunning: false, isIdle: false };
    
    const isRunning = m.status === 'running';
    const isIdle = m.status === 'idle';
    const isError = m.status === 'error';
    
    const prodQty = m.lastPlcData?.productionCount ?? 0;
    const oeeVal = Number(m.lastPlcData?.production?.oee ?? m.lastPlcData?.tags?.oee ?? 0);
    const uphVal = Number(m.lastPlcData?.production?.uph ?? m.lastPlcData?.tags?.uph ?? 0);
    
    return { lineOee: oeeVal, lineOutput: prodQty, lineUph: uphVal, isError, isRunning, isIdle };
  };

  const { lineOee, lineOutput, lineUph, isError } = getLineMetrics(lastMachine);

  const lineStatus = lastMachine ? lastMachine.status : (line.status ?? 'active');
  const variant = getStatusVariant(lineStatus);

  const numMachines = machines ? machines.length : 0;

  const rowBgClass = isError 
    ? 'hover:bg-rose-950/20 bg-rose-950/5' 
    : 'hover:bg-cyan-950/20';

  return (
    <tr 
      onClick={onClick}
      className={`border-b border-[#14356a]/40 cursor-pointer transition-all duration-200 ${rowBgClass}`}
    >
      <td className="px-6 py-4.5 font-mono text-[#9CA3AF] text-center font-bold">
        {String(index + 1).padStart(2, '0')}
      </td>
      <td className="px-6 py-4.5 font-black text-[#EEEEEE] group-hover:text-cyan-400">
        {tDynamic(line.name)}
      </td>
      <td className="px-6 py-4.5 text-center font-bold text-slate-300 font-mono text-sm">
        {numMachines}
      </td>
      <td className="px-6 py-4.5 text-center">
        <Badge variant={variant} dot className="px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
          {lineStatus}
        </Badge>
      </td>
      <td className="px-6 py-4.5 font-mono font-black text-center text-cyan-400 text-sm">
        {lineOee}%
      </td>
      <td className="px-6 py-4.5 font-mono font-black text-center text-[#EEEEEE] text-sm">
        {lineOutput.toLocaleString(locale)} <span className="text-[10px] font-bold text-[#9CA3AF]">pcs</span>
      </td>
      <td className="px-6 py-4.5 font-mono font-black text-center text-[#38BDF8] text-sm">
        {lineUph} <span className="text-[10px] font-bold text-[#9CA3AF]">p/h</span>
      </td>
      <td className="px-6 py-4.5 text-center flex items-center justify-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="px-3 py-1.5 bg-[#00ADB5]/10 hover:bg-[#00ADB5] border border-[#00ADB5]/30 text-[#00ADB5] hover:text-white text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer"
        >
          Sơ đồ
        </button>
        {canDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Xóa dây chuyền này?')) {
                onDelete(line.id);
              }
            }}
            className="px-3 py-1.5 bg-[#EF4444]/10 hover:bg-[#EF4444] border border-[#EF4444]/30 text-[#EF4444] hover:text-white text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer"
          >
            Xóa
          </button>
        )}
      </td>
    </tr>
  );
}
