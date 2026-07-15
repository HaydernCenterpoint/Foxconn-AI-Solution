import { useCallback, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { AxiosError } from 'axios';
import {
  Activity,
  Check,
  CircleAlert,
  Edit3,
  Eye,
  MonitorCog,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  machinesApi,
  type Machine,
  type MachineRequest,
} from '../features/machines/services/machines.api';
import { linesApi } from '../features/production-lines/services/lines.api';
import { Modal } from '../shared/components/ui/Modal';
import { useDynamicTranslation } from '../shared/lib/translator';
import { usePermissions } from '../shared/hooks/usePermissions';
import './machine-list-page.css';

interface ApiErrorPayload {
  error?: string;
}

type MachineState = 'running' | 'idle' | 'error' | 'offline' | 'maintenance' | 'unknown';

function normalizeMachineState(status: string | undefined): MachineState {
  switch (status?.trim().toLowerCase()) {
    case 'running':
    case 'active':
      return 'running';
    case 'idle':
    case 'stopped':
      return 'idle';
    case 'error':
      return 'error';
    case 'offline':
    case 'disconnected':
      return 'offline';
    case 'maintenance':
      return 'maintenance';
    default:
      return 'unknown';
  }
}

function readApiError(error: unknown): string | undefined {
  return (error as AxiosError<ApiErrorPayload>)?.response?.data?.error;
}

function ConnectionState({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`machine-list-page__connection${connected ? ' is-connected' : ' is-disconnected'}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

export const MachineListPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canCreate } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const statusFilter = searchParams.get('status') || '';
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);

  const [machineName, setMachineName] = useState('');
  const [machineCode, setMachineCode] = useState('');
  const [machineIp, setMachineIp] = useState('');
  const [clientId, setClientId] = useState('');
  const [lineId, setLineId] = useState<string>('');
  const [formError, setFormError] = useState('');

  const handleStatusFilterChange = (value: string) => {
    if (value) {
      setSearchParams({ status: value });
    } else {
      setSearchParams({});
    }
  };

  const { data: lines } = useQuery({
    queryKey: ['productionLines-shared'],
    queryFn: linesApi.getAll,
  });

  const {
    data: machinesData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['machines-list-shared'],
    queryFn: machinesApi.getAll,
    refetchInterval: 2_000,
  });
  const machines = machinesData ?? [];

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

  const closeForm = useCallback(() => {
    setShowAddForm(false);
    setEditingMachineId(null);
    setMachineName('');
    setMachineCode('');
    setMachineIp('');
    setClientId('');
    setLineId('');
    setFormError('');
  }, []);

  const createMachineMutation = useMutation({
    mutationFn: async (newMachine: MachineRequest) => {
      await machinesApi.create(newMachine);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
      closeForm();
    },
    onError: (error: unknown) => {
      setFormError(readApiError(error) || t('common.errors.unknown'));
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: MachineRequest }) => {
      await machinesApi.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] });
      closeForm();
    },
    onError: (error: unknown) => {
      setFormError(readApiError(error) || t('common.errors.unknown'));
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

  const handleEditClick = (machine: Machine) => {
    setEditingMachineId(machine.id);
    setMachineName(machine.name);
    setMachineCode(machine.machineCode || '');
    setMachineIp(machine.ip || '');
    setClientId(machine.clientId || '');
    setLineId('');
    setFormError('');
    setShowAddForm(true);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!machineName) return;

    const data: MachineRequest = {
      name: machineName,
      machineCode: machineCode || undefined,
      ip: machineIp || undefined,
      clientId: clientId || undefined,
      lineId: lineId || undefined,
    };

    if (editingMachineId) {
      updateMachineMutation.mutate({ id: editingMachineId, data });
    } else {
      createMachineMutation.mutate(data);
    }
  };

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredMachines = machines.filter((machine) => {
    const matchesSearch = !normalizedSearch || [
      machine.name,
      machine.machineCode,
      machine.ip,
      machine.clientId,
      machine.lineNames,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedSearch));
    const matchesStatus = !statusFilter || machine.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const runningCount = machines.filter((machine) => normalizeMachineState(machine.status) === 'running').length;
  const attentionCount = machines.filter((machine) => {
    const state = normalizeMachineState(machine.status);
    return state === 'error' || state === 'offline';
  }).length;
  const pendingCount = machines.filter((machine) => machine.approvalStatus === 'PENDING').length;
  const isSaving = createMachineMutation.isPending || updateMachineMutation.isPending;

  const approvalLabel = (approvalStatus: Machine['approvalStatus']) => {
    switch (approvalStatus) {
      case 'APPROVED':
        return t('machines.approved');
      case 'REJECTED':
        return t('machines.rejected');
      default:
        return t('machines.pending');
    }
  };

  return (
    <div className="machine-list-page">
      <header className="machine-list-page__hero">
        <div className="machine-list-page__hero-copy">
          <span className="machine-list-page__eyebrow">
            <MonitorCog aria-hidden="true" size={16} />
            {t('navigation.equipment')}
          </span>
          <h1>{t('machines.title')}</h1>
          <p>{t(canCreate ? 'machines.adminSubtitle' : 'machines.viewerSubtitle')}</p>
        </div>

        {canCreate && (
          <button
            type="button"
            className="machine-list-page__primary-action"
            onClick={() => setShowAddForm(true)}
          >
            <Plus aria-hidden="true" size={17} />
            {t('machines.add')}
          </button>
        )}
      </header>

      <section className="machine-list-page__metrics" aria-label={t('machines.listTitle')}>
        <article>
          <span className="machine-list-page__metric-icon"><MonitorCog aria-hidden="true" size={18} /></span>
          <div><small>{t('status.total')}</small><strong>{machines.length}</strong></div>
        </article>
        <article>
          <span className="machine-list-page__metric-icon is-success"><Activity aria-hidden="true" size={18} /></span>
          <div><small>{t('status.running')}</small><strong>{runningCount}</strong></div>
        </article>
        <article>
          <span className="machine-list-page__metric-icon is-danger"><CircleAlert aria-hidden="true" size={18} /></span>
          <div><small>{t('status.error')} / {t('status.offline')}</small><strong>{attentionCount}</strong></div>
        </article>
        <article>
          <span className="machine-list-page__metric-icon is-warning"><ShieldCheck aria-hidden="true" size={18} /></span>
          <div><small>{t('machines.pending')}</small><strong>{pendingCount}</strong></div>
        </article>
      </section>

      <section className="machine-list-page__toolbar" aria-label={t('machines.filtersTitle')}>
        <label className="machine-list-page__search">
          <Search aria-hidden="true" size={17} />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('machines.searchPlaceholder')}
            aria-label={t('machines.searchPlaceholder')}
          />
        </label>

        <label className="machine-list-page__filter">
          <span>{t('machines.filterStatus')}</span>
          <select
            value={statusFilter}
            onChange={(event) => handleStatusFilterChange(event.target.value)}
          >
            <option value="">{t('machines.filterAllStatus')}</option>
            <option value="running">{t('status.running')}</option>
            <option value="idle">{t('status.idle')}</option>
            <option value="error">{t('status.error')}</option>
            <option value="offline">{t('status.offline')}</option>
          </select>
        </label>

        <div className="machine-list-page__result-count" aria-live="polite">
          <strong>{filteredMachines.length}</strong>
          <span>/ {machines.length}</span>
          <small>{t('machines.listTitle')}</small>
        </div>
      </section>

      {canCreate && (
        <Modal
          open={showAddForm}
          onClose={closeForm}
          title={editingMachineId ? t('machines.editModal.title') : t('machines.addModal.title')}
          size="md"
          footer={
            <>
              <button type="button" onClick={closeForm} className="machine-list-page__modal-secondary">
                {t('common.actions.cancel')}
              </button>
              <button
                type="submit"
                form="machine-form"
                disabled={isSaving}
                className="machine-list-page__modal-primary"
              >
                {isSaving ? t('common.status.loading') : t('common.actions.save')}
              </button>
            </>
          }
        >
          <form id="machine-form" onSubmit={handleFormSubmit} className="machine-list-page__form">
            {formError && <div className="machine-list-page__form-error" role="alert">{formError}</div>}

            <label>
              <span>{t('machines.form.name')} *</span>
              <input
                type="text"
                value={machineName}
                onChange={(event) => setMachineName(event.target.value)}
                placeholder={t('machines.form.namePlaceholder')}
                required
              />
            </label>

            <label>
              <span>{t('machines.form.code')}</span>
              <input
                type="text"
                value={machineCode}
                onChange={(event) => setMachineCode(event.target.value)}
                placeholder={t('machines.form.codePlaceholder')}
              />
            </label>

            <label>
              <span>{t('machines.table.ip')}</span>
              <input
                type="text"
                value={machineIp}
                onChange={(event) => setMachineIp(event.target.value)}
                placeholder={t('machines.form.ipPlaceholder')}
              />
            </label>

            <label>
              <span>{t('machines.form.clientId')}</span>
              <input
                type="text"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={t('machines.form.clientIdPlaceholder')}
              />
            </label>

            {!editingMachineId && (
              <label>
                <span>{t('machines.form.line')}</span>
                <select value={lineId} onChange={(event) => setLineId(event.target.value)}>
                  <option value="">{t('machines.form.noLine')}</option>
                  {lines?.map((line) => (
                    <option key={line.id} value={line.id}>{tDynamic(line.name)}</option>
                  ))}
                </select>
              </label>
            )}
          </form>
        </Modal>
      )}

      <section className="machine-list-page__inventory" aria-labelledby="machine-list-title">
        <header className="machine-list-page__inventory-head">
          <div>
            <span className="machine-list-page__inventory-marker" aria-hidden="true" />
            <div>
              <h2 id="machine-list-title">{t('machines.listTitle')}</h2>
              <p>{t('machines.subtitle')}</p>
            </div>
          </div>
          <span>{filteredMachines.length} / {machines.length}</span>
        </header>

        {isLoading ? (
          <div className="machine-list-page__loading" role="status">
            <span>{t('machines.loading')}</span>
            {Array.from({ length: 5 }).map((_, index) => (
              <div aria-hidden="true" key={index}>
                <i /><i /><i /><i />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="machine-list-page__empty-state is-error" role="alert">
            <WifiOff aria-hidden="true" size={28} />
            <h3>{t('machines.errorTitle')}</h3>
            <p>{t('machines.errorDescription')}</p>
            <button type="button" onClick={() => void refetch()}>
              <RefreshCw aria-hidden="true" size={15} />
              {t('common.aria.refresh')}
            </button>
          </div>
        ) : filteredMachines.length === 0 ? (
          <div className="machine-list-page__empty-state">
            <MonitorCog aria-hidden="true" size={28} />
            <h3>{t('common.table.noData')}</h3>
          </div>
        ) : (
          <div className="machine-list-page__table-wrap">
            <table aria-label={t('machines.listTitle')}>
              <thead>
                <tr>
                  <th scope="col">{t('machines.table.name')}</th>
                  <th scope="col">{t('machines.table.code')}</th>
                  <th scope="col">{t('machines.table.ip')}</th>
                  <th scope="col">{t('machines.table.status')}</th>
                  <th scope="col">{t('machines.table.serverConnected')}</th>
                  <th scope="col">{t('machines.table.plcConnected')}</th>
                  <th scope="col">{t('machines.table.approval')}</th>
                  <th scope="col">{t('machines.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredMachines.map((machine) => {
                  const machineState = normalizeMachineState(machine.status);
                  const serverConnected = machineState !== 'offline';
                  const approvalStatus = machine.approvalStatus || 'PENDING';

                  return (
                    <tr key={machine.id}>
                      <td>
                        <div className="machine-list-page__identity">
                          <span className={`machine-list-page__machine-icon is-${machineState}`}>
                            <MonitorCog aria-hidden="true" size={18} />
                          </span>
                          <span>
                            <strong>{tDynamic(machine.name)}</strong>
                            <small>{machine.clientId || t('common.notAvailable')} · {machine.lineNames || t('machines.form.noLine')}</small>
                          </span>
                        </div>
                      </td>
                      <td><code>{machine.machineCode || t('common.notAvailable')}</code></td>
                      <td><code>{machine.ip || t('common.notAvailable')}</code></td>
                      <td>
                        <span className={`machine-list-page__state is-${machineState}`}>
                          <span aria-hidden="true" />
                          {t(`common.machineStatus.${machineState}`, { defaultValue: machine.status })}
                        </span>
                      </td>
                      <td>
                        <ConnectionState
                          connected={serverConnected}
                          label={t(serverConnected ? 'machines.status.serverConnected' : 'machines.status.serverDisconnected')}
                        />
                      </td>
                      <td>
                        <ConnectionState
                          connected={Boolean(machine.plcConnected)}
                          label={t(machine.plcConnected ? 'machines.connected' : 'machines.disconnected')}
                        />
                      </td>
                      <td>
                        <div className="machine-list-page__approval-stack">
                          <span className={`machine-list-page__approval is-${approvalStatus.toLocaleLowerCase()}`}>
                            {approvalLabel(approvalStatus)}
                          </span>
                          {canCreate && (
                            approvalStatus === 'PENDING' ? (
                              <button
                                type="button"
                                className="machine-list-page__approval-action is-approve"
                                onClick={() => approveMutation.mutate(machine.id)}
                                disabled={approveMutation.isPending}
                                title={t('common.actions.approve')}
                                aria-label={t('common.actions.approve')}
                              >
                                <Check aria-hidden="true" size={13} />
                                {t('common.actions.approve')}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="machine-list-page__approval-action is-revoke"
                                onClick={() => revokeMutation.mutate(machine.id)}
                                disabled={revokeMutation.isPending}
                                title={t('common.actions.revoke')}
                                aria-label={t('common.actions.revoke')}
                              >
                                {t('common.actions.revoke')}
                              </button>
                            )
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="machine-list-page__actions">
                          <button
                            type="button"
                            onClick={() => navigate(`/machines/${machine.id}`)}
                            title={t('common.actions.view')}
                            aria-label={t('common.actions.view')}
                          >
                            <Eye aria-hidden="true" size={16} />
                          </button>
                          {canCreate && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditClick(machine)}
                                title={t('common.actions.edit')}
                                aria-label={t('common.actions.edit')}
                              >
                                <Edit3 aria-hidden="true" size={16} />
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                onClick={() => {
                                  if (window.confirm(t('common.confirm.delete'))) {
                                    deleteMachineMutation.mutate(machine.id);
                                  }
                                }}
                                title={t('common.actions.delete')}
                                aria-label={t('common.actions.delete')}
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <span className="machine-list-page__sr-only" aria-live="polite">
        {approveMutation.isPending || revokeMutation.isPending || deleteMachineMutation.isPending
          ? t('common.status.loading')
          : ''}
      </span>
      <Server className="machine-list-page__decorative-server" aria-hidden="true" />
    </div>
  );
};

export default MachineListPage;
