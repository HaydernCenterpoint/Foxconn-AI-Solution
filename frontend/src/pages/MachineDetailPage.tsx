import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Network } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { machinesApi } from '../features/machines/services/machines.api';
import { MachineDetailTabs } from '../features/machines/components/MachineDetailTabs';
import { Badge } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Surface } from '../shared/components/ui/Surface';
import { usePermissions } from '../shared/hooks/usePermissions';
import { useDynamicTranslation } from '../shared/lib/translator';

export const MachineDetailPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canEdit } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const machineQuery = useQuery({
    queryKey: ['machineDetailShared', id],
    queryFn: () => machinesApi.getById(id!),
    enabled: Boolean(id),
    refetchInterval: 1_000,
  });

  const historyQuery = useQuery({
    queryKey: ['machineHistoryShared', id],
    queryFn: () => machinesApi.getHourlyProduction(id!),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });

  const backButton = (
    <Button variant="secondary" size="sm" startIcon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => navigate(-1)}>
      {t('common.actions.back', { defaultValue: 'Back' })}
    </Button>
  );

  if (machineQuery.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('machines.detail.loadingTitle', { defaultValue: 'Machine details' })} actions={backButton} />
        <Surface variant="raised">
          <DataState kind="loading" title={t('machines.detail.loading', { defaultValue: 'Loading machine record' })} description={t('machines.detail.loadingDescription', { defaultValue: 'Retrieving the current machine record and latest reported values.' })} />
        </Surface>
      </div>
    );
  }

  if (machineQuery.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('machines.detail.errorTitle', { defaultValue: 'Machine details' })} actions={backButton} />
        <Surface variant="raised">
          <DataState
            kind="error"
            title={t('machines.detail.queryError', { defaultValue: 'Machine record is unavailable' })}
            description={t('machines.detail.queryErrorDescription', { defaultValue: 'The machine service could not be reached for this record.' })}
            action={<Button variant="secondary" size="sm" onClick={() => void machineQuery.refetch()}>{t('common.actions.retry', { defaultValue: 'Retry' })}</Button>}
          />
        </Surface>
      </div>
    );
  }

  const machine = machineQuery.data;
  if (!machine) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('machines.detail.notFound', { defaultValue: 'Machine not found' })} actions={backButton} />
        <Surface variant="raised">
          <DataState
            kind="empty"
            title={t('machines.detail.notFound', { defaultValue: 'Machine not found' })}
            description={t('machines.detail.notFoundDesc', { defaultValue: 'The requested machine record is not available.' })}
            action={<Button variant="secondary" size="sm" onClick={() => navigate('/machines')}>{t('machines.detail.backList', { defaultValue: 'Back to machines' })}</Button>}
          />
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('machines.detail.eyebrow', { defaultValue: 'Machine workspace' })}
        title={tDynamic(machine.name)}
        description={t('machines.detail.description', { defaultValue: 'Current machine record, last PLC payload, reported history, and related alarm actions.' })}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {backButton}
            <StatusBadge status={machine.status} size="sm" />
            <Badge variant={machine.plcConnected ? 'success' : 'offline'} size="sm" dot>
              <Network size={13} aria-hidden="true" />
              {machine.plcConnected
                ? t('machines.plcConnected', { defaultValue: 'PLC connected' })
                : t('machines.plcDisconnected', { defaultValue: 'PLC disconnected' })}
            </Badge>
          </div>
        )}
      />

      <Surface variant="quiet" padding="md">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-text-muted">{t('machines.detail.machineCodeLabel', { defaultValue: 'Station code' })}</dt>
            <dd className="mt-1 font-mono text-text-primary">{machine.machineCode || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">{t('machines.detail.ipLabel', { defaultValue: 'IP address' })}</dt>
            <dd className="mt-1 font-mono text-text-primary">{machine.ip || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">{t('machines.detail.clientIdLabel', { defaultValue: 'PLC client ID' })}</dt>
            <dd className="mt-1 break-all font-mono text-text-primary">{machine.clientId || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-text-muted">{t('machines.table.approval', { defaultValue: 'Approval' })}</dt>
            <dd className="mt-1 text-text-primary">{machine.approvalStatus || '—'}</dd>
          </div>
        </dl>
      </Surface>

      <MachineDetailTabs
        machine={machine}
        history={historyQuery.data ?? []}
        historyIsLoading={historyQuery.isLoading}
        historyIsError={historyQuery.isError}
        refetchHistory={() => void historyQuery.refetch()}
        isAdminOrEngineer={canEdit}
      />
    </div>
  );
};

export default MachineDetailPage;
