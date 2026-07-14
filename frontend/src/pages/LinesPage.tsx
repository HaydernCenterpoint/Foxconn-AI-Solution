import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Network, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { linesApi, type LineRequest, type ProductionLine } from '../features/production-lines/services/lines.api';
import type { Machine } from '../features/machines/services/machines.api';
import { DiagramEditor } from '../features/production-lines/components/DiagramEditor';
import { queryKeys } from '../app/queryKeys';
import { queryTimings } from '../app/queryOptions';
import { SharedDashboardPage } from '../features/dashboard/components/SharedDashboardPage';
import { Badge, type BadgeVariant } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { ConfirmDialog } from '../shared/components/ui/ConfirmDialog';
import { DataState } from '../shared/components/ui/DataState';
import { Modal } from '../shared/components/ui/Modal';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { StatusBadge } from '../shared/components/ui/StatusBadge';
import { Surface } from '../shared/components/ui/Surface';
import { usePermissions } from '../shared/hooks/usePermissions';
import { useDynamicTranslation } from '../shared/lib/translator';
import { useUiStore } from '../shared/store/ui.store';

interface LineSummary {
  line: ProductionLine;
  index: number;
  machines: Machine[];
  isLoading: boolean;
  isError: boolean;
}

function getLineStatusVariant(status?: string): BadgeVariant {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'running':
      return 'success';
    case 'maintenance':
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    default:
      return 'neutral';
  }
}

function getLineStatusLabel(status?: string) {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}

function getLatestStation(machines: Machine[]) {
  if (machines.length === 0) return undefined;
  return [...machines].sort((left, right) => (left.sequenceOrder ?? 0) - (right.sequenceOrder ?? 0)).at(-1);
}

function formatOutput(machine: Machine | undefined, locale: string) {
  const value = machine?.lastPlcData?.productionCount;
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString(locale) : '—';
}

export default function LinesPage() {
  const { t, i18n } = useTranslation();
  const { tDynamic } = useDynamicTranslation();
  const { canEdit, canCreate, isViewer } = usePermissions();
  const queryClient = useQueryClient();
  const addToast = useUiStore((state) => state.addToast);

  const [selectedLine, setSelectedLine] = useState<ProductionLine | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductionLine | null>(null);
  const [newLineName, setNewLineName] = useState('');
  const [newLineDescription, setNewLineDescription] = useState('');
  const [createError, setCreateError] = useState('');

  const locale = i18n.language === 'zh' || i18n.language === 'zh-CN'
    ? 'zh-CN'
    : i18n.language === 'en'
      ? 'en-US'
      : 'vi-VN';

  const linesQuery = useQuery({
    queryKey: queryKeys.lines.list(),
    queryFn: linesApi.getAll,
    refetchInterval: queryTimings.lines,
  });

  const lineMachineQueries = useQueries({
    queries: (linesQuery.data ?? []).map((line) => ({
      queryKey: ['line-machines', line.id],
      queryFn: () => linesApi.getMachines(line.id),
      refetchInterval: 2_000,
    })),
  });

  const lineSummaries = useMemo<LineSummary[]>(() => (
    (linesQuery.data ?? []).map((line, index) => ({
      line,
      index,
      machines: lineMachineQueries[index]?.data ?? [],
      isLoading: lineMachineQueries[index]?.isLoading ?? false,
      isError: lineMachineQueries[index]?.isError ?? false,
    }))
  ), [lineMachineQueries, linesQuery.data]);

  const createLineMutation = useMutation({
    mutationFn: (data: LineRequest) => linesApi.create(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lines.list() });
      addToast('success', t('linesPage.createSuccess', { defaultValue: 'Production line created' }));
      setIsCreateModalOpen(false);
      setNewLineName('');
      setNewLineDescription('');
      setCreateError('');
    },
    onError: () => {
      const message = t('linesPage.createError', { defaultValue: 'Unable to create the production line' });
      setCreateError(message);
      addToast('error', message);
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: (id: string) => linesApi.delete(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.lines.list() });
      addToast('success', t('linesPage.deleteSuccess', { defaultValue: 'Production line deleted' }));
      setDeleteTarget(null);
      if (selectedLine?.id === deleteTarget?.id) setSelectedLine(null);
    },
    onError: () => {
      addToast('error', t('linesPage.deleteError', { defaultValue: 'Unable to delete the production line' }));
    },
  });

  const handleCreateLineSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newLineName.trim();
    if (!name) return;

    setCreateError('');
    createLineMutation.mutate({
      name,
      description: newLineDescription.trim() || undefined,
    });
  };

  const closeCreateModal = () => {
    if (createLineMutation.isPending) return;
    setIsCreateModalOpen(false);
    setCreateError('');
  };

  // Keep the viewer branch after every hook. This preserves the existing Hooks fix.
  if (isViewer) {
    return <SharedDashboardPage role="viewer" hideBottomCharts={true} />;
  }

  if (selectedLine) {
    return (
      <DiagramEditor
        lineId={selectedLine.id}
        readOnly={!canEdit}
        onClose={() => setSelectedLine(null)}
      />
    );
  }

  const pageHeader = (
    <PageHeader
      eyebrow={t('linesPage.eyebrow', { defaultValue: 'Operations configuration' })}
      title={t('linesPage.title', { defaultValue: 'Production lines' })}
      description={t('linesPage.description', { defaultValue: 'Manage line membership and the station flow stored by the production-line service.' })}
      actions={canCreate ? (
        <Button
          startIcon={<Plus size={16} aria-hidden="true" />}
          onClick={() => {
            setCreateError('');
            setIsCreateModalOpen(true);
          }}
        >
          {t('linesPage.add', { defaultValue: 'Add line' })}
        </Button>
      ) : undefined}
    />
  );

  let content: React.ReactNode;
  if (linesQuery.isLoading) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="loading"
          title={t('linesPage.loading', { defaultValue: 'Loading production lines' })}
          description={t('linesPage.loadingDescription', { defaultValue: 'Retrieving configured production lines and station assignments.' })}
        />
      </Surface>
    );
  } else if (linesQuery.isError) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="error"
          title={t('linesPage.error.title', { defaultValue: 'Production lines are unavailable' })}
          description={t('linesPage.error.description', { defaultValue: 'The production-line service could not be reached.' })}
          action={(
            <Button variant="secondary" size="sm" onClick={() => void linesQuery.refetch()}>
              {t('common.actions.retry', { defaultValue: 'Retry' })}
            </Button>
          )}
        />
      </Surface>
    );
  } else if (lineSummaries.length === 0) {
    content = (
      <Surface variant="raised">
        <DataState
          kind="empty"
          title={t('linesPage.emptyTitle', { defaultValue: 'No production lines configured' })}
          description={t('linesPage.emptyTable', { defaultValue: 'Create a production line before assigning stations or designing its flow.' })}
          action={canCreate ? (
            <Button size="sm" startIcon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsCreateModalOpen(true)}>
              {t('linesPage.add', { defaultValue: 'Add line' })}
            </Button>
          ) : undefined}
        />
      </Surface>
    );
  } else {
    content = (
      <Surface variant="raised" padding="none" className="overflow-hidden">
        <div className="hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('common.table.index', { defaultValue: 'No.' })}</th>
                <th>{t('linesPage.table.name', { defaultValue: 'Production line' })}</th>
                <th>{t('linesPage.table.stations', { defaultValue: 'Stations' })}</th>
                <th>{t('linesPage.table.status', { defaultValue: 'Current status' })}</th>
                <th>{t('linesPage.table.output', { defaultValue: 'Last station output' })}</th>
                <th className="text-right">{t('common.table.actions', { defaultValue: 'Actions' })}</th>
              </tr>
            </thead>
            <tbody>
              {lineSummaries.map((summary) => {
                const latestStation = getLatestStation(summary.machines);
                return (
                  <tr key={summary.line.id}>
                    <td className="font-mono text-text-muted">{String(summary.index + 1).padStart(2, '0')}</td>
                    <td>
                      <div className="min-w-48">
                        <p className="font-semibold text-text-primary">{tDynamic(summary.line.name)}</p>
                        <p className="mt-1 text-xs text-text-muted">
                          {summary.line.description?.trim().startsWith('{')
                            ? t('linesPage.diagramConfigured', { defaultValue: 'Flow configured' })
                            : t('linesPage.diagramNotConfigured', { defaultValue: 'Flow not configured' })}
                        </p>
                      </div>
                    </td>
                    <td>
                      {summary.isLoading ? '—' : summary.isError ? t('common.status.unavailable', { defaultValue: 'Unavailable' }) : summary.machines.length}
                    </td>
                    <td>
                      {latestStation ? (
                        <StatusBadge status={latestStation.status} size="sm" />
                      ) : (
                        <Badge variant={getLineStatusVariant(summary.line.status)} size="sm">
                          {getLineStatusLabel(summary.line.status)}
                        </Badge>
                      )}
                    </td>
                    <td className="font-mono">
                      {formatOutput(latestStation, locale)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          startIcon={<Network size={15} aria-hidden="true" />}
                          onClick={() => setSelectedLine(summary.line)}
                        >
                          {t('linesPage.openDiagram', { defaultValue: 'Open flow' })}
                        </Button>
                        {canCreate && (
                          <Button
                            variant="danger"
                            size="sm"
                            aria-label={t('common.actions.delete', { defaultValue: 'Delete' })}
                            title={t('common.actions.delete', { defaultValue: 'Delete' })}
                            onClick={() => setDeleteTarget(summary.line)}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {lineSummaries.map((summary) => {
            const latestStation = getLatestStation(summary.machines);
            return (
              <Surface key={summary.line.id} variant="quiet" padding="md" className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{tDynamic(summary.line.name)}</p>
                    <p className="mt-1 text-xs text-text-muted">
                      {summary.isLoading
                        ? t('common.status.loading', { defaultValue: 'Loading stations' })
                        : summary.isError
                          ? t('common.status.unavailable', { defaultValue: 'Station data unavailable' })
                          : t('linesPage.stationCount', { defaultValue: '{{count}} stations', count: summary.machines.length })}
                    </p>
                  </div>
                  {latestStation ? (
                    <StatusBadge status={latestStation.status} size="sm" />
                  ) : (
                    <Badge variant={getLineStatusVariant(summary.line.status)} size="sm">{getLineStatusLabel(summary.line.status)}</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                  <span className="text-text-secondary">{t('linesPage.table.output', { defaultValue: 'Last station output' })}</span>
                  <span className="font-mono font-semibold text-text-primary">{formatOutput(latestStation, locale)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" startIcon={<Network size={15} aria-hidden="true" />} onClick={() => setSelectedLine(summary.line)}>
                    {t('linesPage.openDiagram', { defaultValue: 'Open flow' })}
                  </Button>
                  {canCreate && (
                    <Button variant="danger" size="sm" startIcon={<Trash2 size={15} aria-hidden="true" />} onClick={() => setDeleteTarget(summary.line)}>
                      {t('common.actions.delete', { defaultValue: 'Delete' })}
                    </Button>
                  )}
                </div>
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
      {content}

      {canCreate && (
        <Modal
          open={isCreateModalOpen}
          onClose={closeCreateModal}
          title={t('linesPage.createModal.title', { defaultValue: 'Create production line' })}
          subtitle={t('linesPage.createModal.subtitle', { defaultValue: 'A flow can be configured after the line is created.' })}
          size="md"
          footer={(
            <>
              <Button variant="secondary" onClick={closeCreateModal} disabled={createLineMutation.isPending}>
                {t('common.actions.cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button type="submit" form="line-form" loading={createLineMutation.isPending}>
                {t('common.actions.create', { defaultValue: 'Create line' })}
              </Button>
            </>
          )}
        >
          <form id="line-form" className="space-y-4" onSubmit={handleCreateLineSubmit}>
            {createError && (
              <div className="rounded-md border border-error bg-error-container px-3 py-2 text-sm text-error" role="alert">
                {createError}
              </div>
            )}
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('linesPage.createModal.form.name', { defaultValue: 'Line name' })}</span>
              <input
                className="field"
                value={newLineName}
                onChange={(event) => setNewLineName(event.target.value)}
                placeholder={t('linesPage.createModal.form.namePlaceholder', { defaultValue: 'e.g. Assembly line A' })}
                autoFocus
                required
              />
            </label>
            <label className="block space-y-2">
              <span className="label-small text-text-secondary">{t('linesPage.createModal.form.description', { defaultValue: 'Description' })}</span>
              <textarea
                className="field min-h-24 py-3"
                value={newLineDescription}
                onChange={(event) => setNewLineDescription(event.target.value)}
                placeholder={t('linesPage.createModal.form.descriptionPlaceholder', { defaultValue: 'Optional operational context' })}
                rows={3}
              />
            </label>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('linesPage.deleteConfirmTitle', { defaultValue: 'Delete production line?' })}
        description={t('linesPage.deleteConfirmDescription', {
          defaultValue: 'This removes {{name}} and its line configuration. This action cannot be undone from this page.',
          name: deleteTarget ? tDynamic(deleteTarget.name) : '',
        })}
        confirmLabel={t('common.actions.delete', { defaultValue: 'Delete' })}
        confirmTone="danger"
        isPending={deleteLineMutation.isPending}
        onCancel={() => {
          if (!deleteLineMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteLineMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
