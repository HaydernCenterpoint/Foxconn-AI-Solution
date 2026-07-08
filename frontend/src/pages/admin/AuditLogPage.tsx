import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { auditLogsApi } from '../../features/admin/services/auditLogs.api';
import { User, Calendar, Activity, ClipboardList } from 'lucide-react';
import { useDynamicTranslation } from '../../shared/lib/translator';

export const AuditLogPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => auditLogsApi.getAll(),
    refetchInterval: 5000,
  });

  const getActionStyle = (action: string): { bg: string; text: string; border: string } => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('REVOKE') || act.includes('FAILED'))
      return { bg: 'bg-[rgba(255,92,108,0.12)]', text: 'text-[#FF5C6C]', border: 'border-[rgba(255,92,108,0.35)]' };
    if (act.includes('CREATE') || act.includes('ADD') || act.includes('APPROVE') || act.includes('SUCCESS'))
      return { bg: 'bg-[rgba(56,242,107,0.08)]', text: 'text-[#38F26B]', border: 'border-[rgba(56,242,107,0.3)]' };
    if (act.includes('UPDATE') || act.includes('REORDER') || act.includes('EDIT'))
      return { bg: 'bg-[rgba(255,197,71,0.1)]', text: 'text-[#FFC547]', border: 'border-[rgba(255,197,71,0.35)]' };
    return { bg: 'bg-[rgba(111,123,150,0.1)]', text: 'text-[#6F7B96]', border: 'border-[rgba(111,123,150,0.3)]' };
  };

  const panelBg  = { background: 'rgba(7,17,47,0.85)' } as React.CSSProperties;
  const panelCls = 'rounded-xl border border-[rgba(47,123,255,0.25)] overflow-hidden';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-8 h-8 border-2 border-[#18D7FF] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm" style={{ color: '#7183A8' }}>{t('pages.auditLogs.loading', 'Đang tải nhật ký hoạt động...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[rgba(255,92,108,0.35)] bg-[rgba(255,92,108,0.08)] p-5 max-w-2xl mx-auto mt-8">
        <h3 className="font-bold text-[#FF5C6C] text-base">{t('pages.auditLogs.loadErrorTitle', 'Lỗi tải dữ liệu')}</h3>
        <p className="text-sm mt-1" style={{ color: '#B7C8E8' }}>{t('pages.auditLogs.loadError', 'Không thể lấy nhật ký hệ thống. Kiểm tra quyền Admin.')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">{t('titles.auditLogs', 'Nhật ký hệ thống')}</h1>
          <p className="text-xs mt-0.5" style={{ color: '#7183A8' }}>
            {t('pages.auditLogs.subtitle', 'Lịch sử ghi chép hoạt động vận hành và thay đổi cấu hình')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[rgba(47,123,255,0.25)] bg-[rgba(47,123,255,0.06)]">
          <ClipboardList className="w-4 h-4 text-[#18D7FF]" />
          <span className="text-xs font-bold text-[#B7C8E8]">{t('pages.auditLogs.recordsCount', '{{count}} bản ghi', { count: logs.length })}</span>
        </div>
      </div>

      {/* Table */}
      <div className={panelCls} style={panelBg}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[rgba(47,123,255,0.2)] bg-[rgba(47,123,255,0.06)]">
                {[
                  { key: 'id', label: '#ID', className: 'w-20' },
                  { key: 'time', label: t('pages.auditLogs.columns.time', 'Thời gian'), className: 'w-52' },
                  { key: 'user', label: t('pages.auditLogs.columns.user', 'Tài khoản'), className: 'w-40' },
                  { key: 'action', label: t('pages.auditLogs.columns.action', 'Hành động'), className: 'w-48' },
                  { key: 'details', label: t('pages.auditLogs.columns.details', 'Chi tiết'), className: '' }
                ].map(h => (
                  <th key={h.key} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider ${h.className}`} style={{ color: '#7183A8' }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? logs.map(log => {
                const style = getActionStyle(log.action);
                const currentLang = i18n.language || 'vi';
                const locale = currentLang === 'zh-CN' || currentLang === 'zh' ? 'zh-CN' : currentLang === 'en' ? 'en-US' : 'vi-VN';
                return (
                  <tr
                    key={log.id}
                    className="border-b border-[rgba(47,123,255,0.08)] transition-colors hover:bg-[rgba(47,123,255,0.05)]"
                  >
                    {/* ID */}
                    <td className="px-5 py-3.5 font-mono text-xs" style={{ color: '#3A4A6B' }}>
                      #{log.id}
                    </td>

                    {/* Time */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: '#6F7B96' }}>
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        {new Date(log.createdAt).toLocaleString(locale)}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                        <User className="w-3.5 h-3.5 shrink-0" style={{ color: '#7183A8' }} />
                        {log.username}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}>
                        <Activity className="w-3 h-3 shrink-0" />
                        {log.action}
                      </span>
                    </td>

                    {/* Details */}
                    <td className="px-5 py-3.5 text-xs break-words" style={{ color: '#B7C8E8' }}>
                      {tDynamic(log.details ?? '')}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-16 text-center">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3" style={{ color: '#3A4A6B' }} />
                    <p className="text-sm" style={{ color: '#6F7B96' }}>{t('pages.auditLogs.empty', 'Chưa có nhật ký hoạt động nào')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default AuditLogPage;
