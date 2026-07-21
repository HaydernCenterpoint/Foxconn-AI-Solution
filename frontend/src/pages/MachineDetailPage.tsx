import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MachineDetailTabs } from '../features/machines/components/MachineDetailTabs';
import { machinesApi } from '../features/machines/services/machines.api';
import '../features/machines/components/machine-detail.css';
import { usePermissions } from '../shared/hooks/usePermissions';

export const MachineDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const { canEdit } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: machine, isLoading: loadingMachine } = useQuery({
    queryKey: ['machineDetailShared', id],
    queryFn: () => machinesApi.getById(id!),
    enabled: !!id,
    refetchInterval: 1000,
  });

  const { data: history } = useQuery({
    queryKey: ['machineHistoryShared', id],
    queryFn: () => machinesApi.getHourlyProduction(id!),
    enabled: !!id,
    refetchInterval: 10000,
  });

  if (loadingMachine) {
    return (
      <div className="machine-detail machine-detail__state">
        <div className="machine-detail__spinner" aria-hidden="true" />
        <p>{t('machines.detail.loading', 'ĐANG TẢI THÔNG TIN THIẾT BỊ...')}</p>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="machine-detail machine-detail__not-found">
        <h3>{t('machines.detail.notFound', 'Thiết bị không tồn tại')}</h3>
        <p>{t('machines.detail.notFoundDesc', 'Không tìm thấy máy được yêu cầu trong cơ sở dữ liệu hệ thống.')}</p>
        <button type="button" className="machine-detail__primary-button" onClick={() => navigate('/machines')}>
          {t('machines.detail.backList', 'Quay lại danh sách')}
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase().trim()) {
      case 'running':
        return 'machine-detail__status--running';
      case 'error':
        return 'machine-detail__status--error';
      case 'idle':
        return 'machine-detail__status--idle';
      case 'stopped':
      case 'warning':
        return 'machine-detail__status--warning';
      case 'offline':
      default:
        return 'machine-detail__status--offline';
    }
  };

  return (
    <div className="machine-detail">
      <header className="machine-detail__header">
        <div className="machine-detail__identity">
          <button
            type="button"
            className="machine-detail__back-button"
            onClick={() => navigate(-1)}
            title={t('common.actions.back', 'Quay lại')}
          >
            <ArrowLeft aria-hidden="true" size={20} />
          </button>
          <div>
            <p className="machine-detail__eyebrow">{t('machines.detail.machineCodeLabel', 'MÃ MÁY')}</p>
            <h1>{machine.name}</h1>
            <p className="machine-detail__metadata">
              <span>{t('machines.detail.machineCodeLabel', 'MÃ MÁY')}: <b>{machine.machineCode || 'N/A'}</b></span>
              <span>{t('machines.detail.ipLabel', 'IP')}: <b>{machine.ip || '0.0.0.0'}</b></span>
              {machine.clientId && <span>{t('machines.detail.clientIdLabel', 'CLIENT ID')}: <b>{machine.clientId}</b></span>}
            </p>
          </div>
        </div>

        <div className="machine-detail__status-group">
          <span className={`machine-detail__status ${getStatusBadge(machine.status)}`}>
            {machine.status.toUpperCase()}
          </span>
          <span className={`machine-detail__connection ${machine.plcConnected ? 'machine-detail__connection--online' : 'machine-detail__connection--offline'}`}>
            {machine.plcConnected
              ? t('machines.detail.plcOnline', 'PLC: ONLINE')
              : t('machines.detail.plcOffline', 'PLC: OFFLINE')}
          </span>
        </div>
      </header>

      <MachineDetailTabs
        machine={machine}
        history={history || []}
        isAdminOrEngineer={canEdit}
      />
    </div>
  );
};

export default MachineDetailPage;
