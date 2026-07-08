import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { machinesApi } from '../features/machines/services/machines.api';
import { ArrowLeft } from 'lucide-react';
import { MachineDetailTabs } from '../features/machines/components/MachineDetailTabs';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '../shared/hooks/usePermissions';

export const MachineDetailPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { canEdit } = usePermissions();
  const currentLang = i18n.language || 'vi';
  const locale = currentLang === 'zh-CN' || currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'vi-VN';
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Query: Machine general info & telemetry data
  const { data: machine, isLoading: loadingMachine } = useQuery({
    queryKey: ['machineDetailShared', id],
    queryFn: () => machinesApi.getById(id!),
    enabled: !!id,
    refetchInterval: 1000, // Refresh telemetry every second
  });

  // Query: Hourly production history (last 48 hours)
  const { data: history } = useQuery({
    queryKey: ['machineHistoryShared', id],
    queryFn: () => machinesApi.getHourlyProduction(id!),
    enabled: !!id,
    refetchInterval: 10000, // Refresh history charts every 10 seconds
  });

  if (loadingMachine) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin"></div>
        <p className="text-[#00ADB5] text-sm font-semibold tracking-wider">{t('machines.detail.loading', 'ĐANG TẢI THÔNG TIN THIẾT BỊ...')}</p>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="p-6 max-w-2xl mx-auto mt-8 border border-red-500/40 bg-red-500/10 text-red-400 rounded-lg shadow-[0_0_15px_rgba(239,68,68,0.15)]">
        <h3 className="font-bold text-lg uppercase tracking-wider">{t('machines.detail.notFound', 'Thiết bị không tồn tại')}</h3>
        <p className="text-sm mt-2">{t('machines.detail.notFoundDesc', 'Không tìm thấy máy được yêu cầu trong cơ sở dữ liệu hệ thống.')}</p>
        <button
          onClick={() => navigate('/machines')}
          className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors cursor-pointer"
        >
          {t('machines.detail.backList', 'Quay lại danh sách')}
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase().trim()) {
      case 'running':
        return 'text-[#38f26b] bg-[#38f26b]/10 border-[#38f26b]/30';
      case 'error':
        return 'text-[#ff5c6c] bg-[#ff5c6c]/10 border-[#ff5c6c]/30 animate-pulse';
      case 'idle':
        return 'text-[#18d7ff] bg-[#18d7ff]/10 border-[#18d7ff]/30';
      case 'stopped':
      case 'warning':
        return 'text-[#ffc547] bg-[#ffc547]/10 border-[#ffc547]/30';
      case 'offline':
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6 text-white bg-transparent">
      {/* Back link & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#14356a] pb-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 bg-[#0A1129]/80 border border-[#14356a] rounded-xl hover:bg-cyan-500/10 text-cyan-400 hover:text-white transition-all shadow-[0_0_12px_rgba(0,173,181,0.2)] cursor-pointer"
            title={t('common.actions.back', 'Quay lại')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-wider uppercase">
              {machine.name}
            </h1>
            <p className="text-xs text-[#B7C8E8] mt-1 font-semibold tracking-wider">
              {t('machines.detail.machineCodeLabel', 'MÃ MÁY')}: <span className="font-mono text-cyan-400">{machine.machineCode || 'N/A'}</span>
              <span className="mx-2 text-[#14356a]">|</span>
              {t('machines.detail.ipLabel', 'IP')}: <span className="font-mono text-cyan-400">{machine.ip || '0.0.0.0'}</span>
              {machine.clientId && (
                <>
                  <span className="mx-2 text-[#14356a]">|</span>
                  {t('machines.detail.clientIdLabel', 'CLIENT ID')}: <span className="font-mono text-cyan-400">{machine.clientId}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <span className={`px-4 py-1.5 rounded-full text-xs font-black border uppercase tracking-widest ${getStatusBadge(machine.status)}`}>
            {machine.status.toUpperCase()}
          </span>
          {machine.plcConnected ? (
            <span className="bg-[#38f26b]/10 border border-[#38f26b]/30 text-[#38f26b] px-4 py-1.5 rounded-full text-xs font-black tracking-widest">
              {t('machines.detail.plcOnline', 'PLC: ONLINE')}
            </span>
          ) : (
            <span className="bg-slate-500/10 border border-slate-500/20 text-slate-400 px-4 py-1.5 rounded-full text-xs font-black tracking-widest">
              {t('machines.detail.plcOffline', 'PLC: OFFLINE')}
            </span>
          )}
        </div>
      </div>

      <MachineDetailTabs
        machine={machine}
        history={history || []}
        isAdminOrEngineer={canEdit}
      />
    </div>
  );
};
export default MachineDetailPage;
