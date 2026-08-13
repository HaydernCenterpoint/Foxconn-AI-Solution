import React from 'react';
import { MaterialSymbol } from '../../shared/components/ui/MaterialSymbol';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { auditLogsApi } from '../../features/admin/services/auditLogs.api';
import { useDynamicTranslation } from '../../shared/lib/translator';
import './admin-modern.css';

type AuditTone = 'danger' | 'success' | 'warning' | 'neutral';

function actionTone(action: string): AuditTone {
  const normalized = action.toUpperCase();
  if (normalized.includes('DELETE') || normalized.includes('REVOKE') || normalized.includes('FAILED')) return 'danger';
  if (normalized.includes('CREATE') || normalized.includes('ADD') || normalized.includes('APPROVE') || normalized.includes('SUCCESS')) return 'success';
  if (normalized.includes('UPDATE') || normalized.includes('REORDER') || normalized.includes('EDIT')) return 'warning';
  return 'neutral';
}

function resolveLocale(language: string): string {
  if (language === 'zh-CN' || language === 'zh') return 'zh-CN';
  if (language === 'en') return 'en-US';
  return 'vi-VN';
}

export const AuditLogPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => auditLogsApi.getAll(),
    refetchInterval: 5000,
  });
  const locale = resolveLocale(i18n.language || 'vi');

  if (isLoading) {
    return (
      <div className="admin-page admin-page__state">
        <div className="admin-page__spinner" aria-hidden="true" />
        <p>{t('pages.auditLogs.loading', 'Đang tải nhật ký hoạt động...')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-page admin-page__error">
        <h3>{t('pages.auditLogs.loadErrorTitle', 'Lỗi tải dữ liệu')}</h3>
        <p>{t('pages.auditLogs.loadError', 'Không thể lấy nhật ký hệ thống. Kiểm tra quyền Admin.')}</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-audit-page">
      <header className="admin-page__header">
        <div>
          <p>{t('pages.auditLogs.subtitle', 'Lịch sử ghi chép hoạt động vận hành và thay đổi cấu hình')}</p>
          <h1>{t('titles.auditLogs', 'Nhật ký hệ thống')}</h1>
        </div>
        <div className="admin-page__record-count">
          <MaterialSymbol name="assignment" size={17} />
          {t('pages.auditLogs.recordsCount', '{{count}} bản ghi', { count: logs.length })}
        </div>
      </header>

      <section className="admin-page__panel admin-page__table-panel">
        <div className="admin-page__table-wrap">
          <table className="admin-audit-page__table">
            <thead>
              <tr>
                <th scope="col">{t('pages.auditLogs.columns.id')}</th>
                <th scope="col">{t('pages.auditLogs.columns.time', 'Thời gian')}</th>
                <th scope="col">{t('pages.auditLogs.columns.user', 'Tài khoản')}</th>
                <th scope="col">{t('pages.auditLogs.columns.action', 'Hành động')}</th>
                <th scope="col">{t('pages.auditLogs.columns.details', 'Chi tiết')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? logs.map((log) => (
                <tr key={log.id}>
                  <td className="admin-page__index">#{log.id}</td>
                  <td>
                    <span className="admin-audit-page__time"><MaterialSymbol name="calendar_month" size={14} /> {new Date(log.createdAt).toLocaleString(locale)}</span>
                  </td>
                  <td>
                    <span className="admin-audit-page__user"><MaterialSymbol name="person" size={14} /> {log.username}</span>
                  </td>
                  <td>
                    <span className={`admin-page__badge admin-page__badge--${actionTone(log.action)}`}>
                      <MaterialSymbol name="monitoring" size={13} />
                      {log.action}
                    </span>
                  </td>
                  <td className="admin-audit-page__details">{tDynamic(log.details ?? '')}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="admin-page__empty-state">
                    <MaterialSymbol name="assignment" size={36} />
                    <p>{t('pages.auditLogs.empty', 'Chưa có nhật ký hoạt động nào')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default AuditLogPage;
