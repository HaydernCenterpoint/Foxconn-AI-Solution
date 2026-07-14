import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Eye, Pencil, Plus, Search, ShieldOff, Trash2, Undo2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { machinesApi, type Machine, type MachineRequest } from '../features/machines/services/machines.api';
import { linesApi } from '../features/production-lines/services/lines.api';
import { Button } from '../shared/components/ui/Button';
import { ConfirmDialog } from '../shared/components/ui/ConfirmDialog';
import { DataState } from '../shared/components/ui/DataState';
import { Dropdown } from '../shared/components/ui/Dropdown';
import { Modal } from '../shared/components/ui/Modal';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { Badge, type BadgeVariant } from '../shared/components/ui/Badge';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Surface } from '../shared/components/ui/Surface';
import { usePermissions } from '../shared/hooks/usePermissions';
import { useDynamicTranslation } from '../shared/lib/translator';
import { useUiStore } from '../shared/store/ui.store';

type DestructiveMachineAction = 'reject' | 'revoke' | 'delete';

interface PendingMachineAction {
  machine: Machine;
  kind: DestructiveMachineAction;
}

function approvalVariant(status?: string): BadgeVariant {
  switch (status?.toUpperCase()) {
    case 'APPROVED':
      return 'success';
    case 'PENDING':
      return 'warning';
    case 'REJECTED':
      return 'error';
    default:
      return 'neutral';
  }
}

function actionCopy(kind: DestructiveMachineAction, t: ReturnType<typeof useTranslation>['t']) {
  if (kind === 'delete') {
    return {
      title: t('machines.deleteConfirmTitle', { defaultValue: 'Delete machine?' }),
      description: t('machines.deleteConfirmDescription', { defaultValue: 'This removes the machine record and cannot be undone from this page.' }),
      confirmLabel: t('common.actions.delete', { defaultValue: 'Delete' }),
    };
  }

  if (kind === 'reject') {
    return {
      title: t('machines.rejectConfirmTitle', { defaultValue: 'Reject machine registration?' }),
      description: t('machines.rejectConfirmDescription', { defaultValue: 'The machine will no longer be approved for operation.' }),
      confirmLabel: t('common.actions.reject', { defaultValue: 'Reject' }),
    };
  }

  return {
    title: t('machines.revokeConfirmTitle', { defaultValue: 'Revoke machine approval?' }),
    description: t('machines.revokeConfirmDescription', { defaultValue: 'The machine will need to be approved again before it can operate as an approved station.' }),
    confirmLabel: t('common.actions.revoke', { defaultValue: 'Revoke' }),
  };
}

interface MachineActionButtonsProps {
  machine: Machine;
  canManage: boolean;
  isApproving: boolean;
  isConfirming: boolean;
  onView: () => void;
  onEdit: () => void;
  onApprove: () => void;
  onConfirm: (kind: DestructiveMachineAction) => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function MachineActionButtons({
  machine,
  canManage,
  isApproving,
  isConfirming,
  onView,
  onEdit,
  onApprove,
  onConfirm,
  t,
}: MachineActionButtonsProps) {
  const approval = machine.approvalStatus?.toUpperCase();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" startIcon={<Eye size={14} aria-hidden="true" />} onClick={onView}>
        {t('common.actions.view', { defaultValue: 'View' })}
      </Button>
      {canManage && (
        <>
          {approval === 'PENDING' && (
            <>
              <Button size="sm" loading={isApproving} startIcon={<Check size={14} aria-hidden="true" />} onClick={onApprove}>
                {t('common.actions.approve', { defaultValue: 'Approve' })}
              </Button>
              <Button size="sm" variant="danger" disabled={isApproving || isConfirming} startIcon={<ShieldOff size={14} aria-hidden="true" />} onClick={() => onConfirm('reject')}>
                {t('common.actions.reject', { defaultValue: 'Reject' })}
              </Button>
            </>
          )}
          {approval === 'APPROVED' && (
            <Button size="sm" variant="secondary" disabled={isConfirming} startIcon={<Undo2 size={14} aria-hidden="true" />} onClick={() => onConfirm('revoke')}>
              {t('common.actions.revoke', { defaultValue: 'Revoke' })}
            </Button>
          )}
          <Button size="sm" variant="ghost" startIcon={<Pencil size={14} aria-hidden="true" />} onClick={onEdit}>
            {t('common.actions.edit', { defaultValue: 'Edit' })}
          </Button>
          <Button size="sm" variant="danger" disabled={isConfirming} startIcon={<Trash2 size={14} aria-hidden="true" />} onClick={() => onConfirm('delete')}>
            {t('common.actions.delete', { defaultValue: 'Delete' })}
          </Button>
        </>
      )}
    </div>
  );
}

export const MachineListPage = () => {
  const { t } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canCreate } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);

  const [search, setSearch] = useState('');
  const statusFilter = searchParams.get('status') || '';
  const [showForm, setShowForm] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingMachineAction | null>(null);
  const [machineName, setMachineName] = useState('');
  const [machineCode, setMachineCode] = useState('');
  const [machineIp, setMachineIp] = useState('');
  const [clientId, setClientId] = useState('');
  const [lineId, setLineId] = useState('');
  const [formError, setFormError] = useState('');



  const linesQuery = useQuery({
    queryKey: ['productionLines-shared'],
    queryFn: linesApi.getAll,
  });

  const machinesQuery = useQuery({
    queryKey: ['machines-list-shared'],
    queryFn: machinesApi.getAll,
    refetchInterval: 2_000,
  });

  const invalidateMachines = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['machines-list-shared'] }),
      queryClient.invalidateQueries({ queryKey: ['machines', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['machines-all-selector'] }),
    ]);
  };

  const closeForm = () => {
    if (createMachineMutation.isPending || updateMachineMutation.isPending) return;
    setShowForm(false);
    setEditingMachine(null);
    setMachineName('');
    setMachineCode('');
    setMachineIp('');
    setClientId('');
    setLineId('');
    setFormError('');
  };

  const createMachineMutation = useMutation({
    mutationFn: (payload: MachineRequest) => machinesApi.create(payload),
    onSuccess: async () => {
      await invalidateMachines();
      addToast('success', t('machines.createSuccess', { defaultValue: 'Machine created' }));
      closeForm();
    },
    onError: (error: unknown) => {
      const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const message = responseError || t('machines.createError', { defaultValue: 'Unable to create the machine' });
      setFormError(message);
      addToast('error', message);
    },
  });

  const updateMachineMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: MachineRequest }) => machinesApi.update(id, payload),
    onSuccess: async () => {
      await invalidateMachines();
      addToast('success', t('machines.updateSuccess', { defaultValue: 'Machine updated' }));
      closeForm();
    },
    onError: (error: unknown) => {
      const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      const message = responseError || t('machines.updateError', { defaultValue: 'Unable to update the machine' });
      setFormError(message);
      addToast('error', message);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => machinesApi.approve(id),
    onSuccess: async () => {
      await invalidateMachines();
      addToast('success', t('machines.approveSuccess', { defaultValue: 'Machine approved' }));
    },
    onError: () => {
      addToast('error', t('machines.approveError', { defaultValue: 'Unable to approve the machine' }));
    },
  });

  const destructiveMutation = useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: DestructiveMachineAction }) => {
      if (kind === 'reject') return machinesApi.reject(id);
      if (kind === 'revoke') return machinesApi.revoke(id);
      return machinesApi.delete(id);
    },
    onSuccess: async (_result, variables) => {
      await invalidateMachines();
      const messageKey = variables.kind === 'delete'
        ? 'machines.deleteSuccess'
        : variables.kind === 'reject'
          ? 'machines.rejectSuccess'
          : 'machines.revokeSuccess';
      const fallback = variables.kind === 'delete'
        ? 'Machine deleted'
        : variables.kind === 'reject'
          ? 'Machine rejected'
          : 'Machine approval revoked';
      addToast('success', t(messageKey, { defaultValue: fallback }));
      setPendingAction(null);
    },
    onError: (_error, variables) => {
      const messageKey = variables.kind === 'delete'
        ? 'machines.deleteError'
        : variables.kind === 'reject'
          ? 'machines.rejectError'
          : 'machines.revokeError';
      const fallback = variables.kind === 'delete'
        ? 'Unable to delete the machine'
        : variables.kind === 'reject'
          ? 'Unable to reject the machine'
          : 'Unable to revoke machine approval';
      addToast('error', t(messageKey, { defaultValue: fallback }));
    },
  });

  const handleStatusFilterChange = (value: string) => {
    setSearchParams(value ? { status: value } : {});
  };

  const openCreateForm = () => {
    setEditingMachine(null);
    setMachineName('');
    setMachineCode('');
    setMachineIp('');
    setClientId('');
    setLineId('');
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (machine: Machine) => {
    setEditingMachine(machine);
    setMachineName(machine.name);
    setMachineCode(machine.machineCode || '');
    setMachineIp(machine.ip || '');
    setClientId(machine.clientId || '');
    setLineId('');
    setFormError('');
    setShowForm(true);
  };

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = machineName.trim();
    if (!name) return;

    setFormError('');
    const payload: MachineRequest = {
      name,
      machineCode: machineCode.trim() || undefined,
      ip: machineIp.trim() || undefined,
      clientId: clientId.trim() || undefined,
      lineId: editingMachine ? undefined : lineId || undefined,
    };

    if (editingMachine) {
      updateMachineMutation.mutate({ id: editingMachine.id, payload });
    } else {
      createMachineMutation.mutate(payload);
    }
  };

  const machines = useMemo(() => machinesQuery.data ?? [], [machinesQuery.data]);
  const filteredMachines = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return machines.filter((machine) => {
      const matchesSearch = !normalizedSearch
        || machine.name.toLowerCase().includes(normalizedSearch)
        || (machine.machineCode || '').toLowerCase().includes(normalizedSearch)
        || (machine.ip || '').toLowerCase().includes(normalizedSearch)
        || (machine.clientId || '').toLowerCase().includes(normalizedSearch);
      const matchesStatus = !statusFilter || machine.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    });
  }, [machines, search, statusFilter]);

  const isFormPending = createMachineMutation.isPending || updateMachineMutation.isPending;
  const confirmCopy = pendingAction ? actionCopy(pendingAction.kind, t) : null;

  const pageHeader = (
    <PageHeader
      eyebrow={t('machines.eyebrow', { defaultValue: 'Asset administration' })}
      title={t('machines.title', { defaultValue: 'Machines' })}
      description={t('machines.adminSubtitle', { defaultValue: 'Register stations, review approval status, and maintain machine connection details.' })}
      actions={canCreate ? (
        <Button startIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>
          {t('machines.add', { defaultValue: 'Add machine' })}
        </Button>
      ) : undefined}
    />
  );

  const filters = (
    <Surface variant="quiet" className="toolbar" padding="md">
      <label className="relative min-w-0 flex-1 basis-60">
        <span className="sr-only">{t('machines.searchLabel', { defaultValue: 'Search machines' })}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          className="field pl-10"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('machines.searchPlaceholder', { defaultValue: 'Search by name, code, IP, or client ID' })}
        />
      </label>
      <Dropdown
        value={statusFilter}
        onChange={handleStatusFilterChange}
        labelPrefix={t('machines.statusFilter', { defaultValue: 'Status' })}
        options={[
          { value: '', label: t('machines.filterAllStatus', { defaultValue: 'All statuses' }) },
          { value: 'running', label: t('status.running', { defaultValue: 'Running' }) },
          { value: 'idle', label: t('status.idle', { defaultValue: 'Idle' }) },
          { value: 'stopped', label: t('status.stopped', { defaultValue: 'Stopped' }) },
          { value: 'error', label: t('status.error', { defaultValue: 'Error' }) },
          { value: 'offline', label: t('status.offline', { defaultValue: 'Offline' }) },
        ]}
      />
    </Surface>
  );

  let machineContent: React.ReactNode;
  if (machinesQuery.isLoading) {
    machineContent = (
      <Surface variant="raised">
        <DataState
          kind="loading"
          title={t('machines.loading', { defaultValue: 'Loading machines' })}
          description={t('machines.loadingDescription', { defaultValue: 'Retrieving machine registration and connection records.' })}
        />
      </Surface>
    );
  } else if (machinesQuery.isError) {
    machineContent = (
      <Surface variant="raised">
        <DataState
          kind="error"
          title={t('machines.queryErrorTitle', { defaultValue: 'Machines are unavailable' })}
          description={t('machines.queryErrorDescription', { defaultValue: 'The machine service could not be reached. No machine data is shown.' })}
          action={(
            <Button variant="secondary" size="sm" onClick={() => void machinesQuery.refetch()}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          )}
        />
      </Surface>
    );
  } else if (filteredMachines.length === 0) {
    const hasFilters = Boolean(search.trim() || statusFilter);
    machineContent = (
      <Surface variant="raised">
        <DataState
          kind="empty"
          title={hasFilters
            ? t('machines.emptyFilteredTitle', { defaultValue: 'No machines match the current filters' })
            : t('machines.emptyTitle', { defaultValue: 'No machines registered' })}
          description={hasFilters
            ? t('machines.emptyFilteredDescription', { defaultValue: 'Change or clear the filters to view other machine records.' })
            : t('machines.emptyDescription', { defaultValue: 'Register a machine when a new PLC client or station is ready for setup.' })}
          action={hasFilters ? (
            <Button variant="secondary" size="sm" onClick={() => {
              setSearch('');
              handleStatusFilterChange('');
            }}>
              {t('common.actions.clearFilters', { defaultValue: 'Clear filters' })}
            </Button>
          ) : canCreate ? (
            <Button size="sm" startIcon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>
              {t('machines.add', { defaultValue: 'Add machine' })}
            </Button>
          ) : undefined}
        />
      </Surface>
    );
  } else {
    machineContent = (
      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('machines.table.name', { defaultValue: 'Machine' })}</th>
                <th>{t('machines.table.code', { defaultValue: 'Station code' })}</th>
                <th>{t('machines.table.ip', { defaultValue: 'IP address' })}</th>
                <th>{t('machines.table.status', { defaultValue: 'Status' })}</th>
                <th>{t('machines.table.plcConnected', { defaultValue: 'PLC connection' })}</th>
                <th>{t('machines.table.approval', { defaultValue: 'Approval' })}</th>
                <th className="text-right">{t('machines.table.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {filteredMachines.map((machine) => {
                const isApproving = approveMutation.isPending && approveMutation.variables === machine.id;
                const isConfirming = destructiveMutation.isPending && destructiveMutation.variables?.id === machine.id;
                return (
                  <tr key={machine.id}>
                    <td>
                      <div>
                        <p className="font-semibold text-text-primary">{tDynamic(machine.name)}</p>
                        {machine.lineNames && <p className="mt-1 text-xs text-text-muted">{machine.lineNames}</p>}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{machine.machineCode || '—'}</td>
                    <td className="font-mono text-xs">{machine.ip || '—'}</td>
                    <td><StatusBadge status={machine.status} size="sm" /></td>
                    <td>
                      <Badge variant={machine.plcConnected ? 'success' : 'offline'} size="sm" dot>
                        {machine.plcConnected
                          ? t('machines.plcConnected', { defaultValue: 'Connected' })
                          : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}
                      </Badge>
                    </td>
                    <td><Badge variant={approvalVariant(machine.approvalStatus)} size="sm">{machine.approvalStatus || '—'}</Badge></td>
                    <td>
                      <div className="flex justify-end">
                        <MachineActionButtons
                          machine={machine}
                          canManage={canCreate}
                          isApproving={isApproving}
                          isConfirming={isConfirming}
                          onView={() => navigate(`/machines/${machine.id}`)}
                          onEdit={() => openEditForm(machine)}
                          onApprove={() => approveMutation.mutate(machine.id)}
                          onConfirm={(kind) => setPendingAction({ machine, kind })}
                          t={t}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {filteredMachines.map((machine) => {
            const isApproving = approveMutation.isPending && approveMutation.variables === machine.id;
            const isConfirming = destructiveMutation.isPending && destructiveMutation.variables?.id === machine.id;
            return (
              <Surface key={machine.id} variant="quiet" padding="md" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{tDynamic(machine.name)}</p>
                    <p className="mt-1 font-mono text-xs text-text-muted">{machine.machineCode || '—'}</p>
                  </div>
                  <StatusBadge status={machine.status} size="sm" />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border py-3 text-sm">
                  <div>
                    <dt className="text-xs text-text-muted">{t('machines.table.ip', { defaultValue: 'IP address' })}</dt>
                    <dd className="mt-1 font-mono text-text-primary">{machine.ip || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-muted">{t('machines.table.approval', { defaultValue: 'Approval' })}</dt>
                    <dd className="mt-1"><Badge variant={approvalVariant(machine.approvalStatus)} size="sm">{machine.approvalStatus || '—'}</Badge></dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-text-muted">{t('machines.table.plcConnected', { defaultValue: 'PLC connection' })}</dt>
                    <dd className="mt-1"><Badge variant={machine.plcConnected ? 'success' : 'offline'} size="sm" dot>{machine.plcConnected ? t('machines.plcConnected', { defaultValue: 'Connected' }) : t('machines.plcDisconnected', { defaultValue: 'Disconnected' })}</Badge></dd>
                  </div>
                </dl>
                <MachineActionButtons
                  machine={machine}
                  canManage={canCreate}
                  isApproving={isApproving}
                  isConfirming={isConfirming}
                  onView={() => navigate(`/machines/${machine.id}`)}
                  onEdit={() => openEditForm(machine)}
                  onApprove={() => approveMutation.mutate(machine.id)}
                  onConfirm={(kind) => setPendingAction({ machine, kind })}
                  t={t}
                />
              </Surface>
            );
          })}
        </div>
      </Surface>
    );
  }

  return (
    <div className="space-y-6">
      {pageHeader}
      {filters}
      {machineContent}

      {canCreate && (
        <Modal
          open={showForm}
          onClose={closeForm}
          title={editingMachine
            ? t('machines.editModal.title', { defaultValue: 'Edit machine' })
            : t('machines.addModal.title', { defaultValue: 'Add machine' })}
          subtitle={editingMachine
            ? t('machines.editModal.subtitle', { defaultValue: 'Update the registered machine connection details.' })
            : t('machines.addModal.subtitle', { defaultValue: 'Register a machine before it is approved for operations.' })}
          size="md"
          footer={(
            <>
              <Button variant="secondary" disabled={isFormPending} onClick={closeForm}>
                {t('common.actions.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" form="machine-form" loading={isFormPending}>
                {editingMachine ? t('common.actions.save', { defaultValue: 'Save changes' }) : t('common.actions.create', { defaultValue: 'Create machine' })}
              </Button>
            </>
          )}
        >
          <form id="machine-form" className="space-y-4" onSubmit={handleFormSubmit}>
            {formError && <div className="rounded-md border border-error bg-error-container px-3 py-2 text-sm text-error" role="alert">{formError}</div>}
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('machines.form.name', { defaultValue: 'Machine name' })}</span>
              <input className="field" value={machineName} onChange={(event) => setMachineName(event.target.value)} required autoFocus />
            </label>
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('machines.form.code', { defaultValue: 'Station code' })}</span>
              <input className="field" value={machineCode} onChange={(event) => setMachineCode(event.target.value)} />
            </label>
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('machines.form.ip', { defaultValue: 'IP address' })}</span>
              <input className="field font-mono" value={machineIp} onChange={(event) => setMachineIp(event.target.value)} inputMode="url" />
            </label>
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('machines.form.clientId', { defaultValue: 'PLC client ID' })}</span>
              <input className="field font-mono" value={clientId} onChange={(event) => setClientId(event.target.value)} />
            </label>
            {!editingMachine && (
              <label className="block space-y-2">
                <span className="label-small text-text-secondary">{t('machines.form.line', { defaultValue: 'Assign to production line' })}</span>
                <select className="field" value={lineId} onChange={(event) => setLineId(event.target.value)}>
                  <option value="">{t('machines.form.noLine', { defaultValue: 'Do not assign yet' })}</option>
                  {(linesQuery.data ?? []).map((line) => (
                    <option key={line.id} value={line.id}>{tDynamic(line.name)}</option>
                  ))}
                </select>
              </label>
            )}
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={confirmCopy?.title ?? ''}
        description={pendingAction
          ? `${tDynamic(pendingAction.machine.name)} — ${confirmCopy?.description ?? ''}`
          : ''}
        confirmLabel={confirmCopy?.confirmLabel}
        confirmTone="danger"
        isPending={destructiveMutation.isPending}
        onCancel={() => {
          if (!destructiveMutation.isPending) setPendingAction(null);
        }}
        onConfirm={() => {
          if (pendingAction) {
            destructiveMutation.mutate({ id: pendingAction.machine.id, kind: pendingAction.kind });
          }
        }}
      />
    </div>
  );
};

export default MachineListPage;
