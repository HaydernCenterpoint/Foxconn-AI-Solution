import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, FileText, FolderTree, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { queryKeys } from '../app/queryKeys';
import { alarmsApi } from '../features/alarms/services/alarms.api';
import { assetsApi, type AssetTreeNode } from '../features/assets/services/assets.api';
import {
  healthColorVariant,
  isAssetId,
  predictiveAlertsApi,
  rollUpHealthScores,
} from '../features/dashboard/services/predictiveAlerts.api';
import { machinesApi } from '../features/machines/services/machines.api';
import { Badge, type BadgeVariant } from '../shared/components/ui/Badge';
import { Button } from '../shared/components/ui/Button';
import { DataState } from '../shared/components/ui/DataState';
import { PageHeader } from '../shared/components/ui/PageHeader';
import { Surface } from '../shared/components/ui/Surface';
import { useAuthStore } from '../shared/store/auth.store';

const EMPTY_ASSET_TREE: AssetTreeNode[] = [];
const CATALOG_OWNED = new Set(['PLANT', 'AREA', 'SENSOR']);
const HEALTH_FETCH_LIMIT = 40;

function healthVariant(score: number): BadgeVariant {
  return healthColorVariant(score);
}

function findAsset(nodes: AssetTreeNode[], assetId: string | null): AssetTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === assetId) return node;
    const child = findAsset(node.children, assetId);
    if (child) return child;
  }
  return undefined;
}

function filterTree(nodes: AssetTreeNode[], search: string): AssetTreeNode[] {
  if (!search) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, search);
    const matches = [node.name, node.code, node.type].some((value) => value.toLocaleLowerCase().includes(search));
    if (matches) return [node];
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

function collectAssetIds(nodes: AssetTreeNode[], acc: string[] = []): string[] {
  for (const node of nodes) {
    if (isAssetId(node.id)) acc.push(node.id);
    if (node.children.length > 0) collectAssetIds(node.children, acc);
  }
  return acc;
}

/** Worst-child roll-up for parent nodes; leaf keeps own score when present. */
function computeHealthRollups(
  nodes: AssetTreeNode[],
  scores: Record<string, number | null>,
): Record<string, number | null> {
  const result: Record<string, number | null> = { ...scores };

  const visit = (node: AssetTreeNode): number | null => {
    const childScores = node.children.map(visit);
    const own = scores[node.id] ?? null;
    const rolled = rollUpHealthScores([own, ...childScores]);
    result[node.id] = rolled;
    return rolled;
  };

  nodes.forEach(visit);
  return result;
}

function AssetTree({
  nodes,
  selectedId,
  onSelect,
  healthById,
  depth = 0,
}: {
  nodes: AssetTreeNode[];
  selectedId: string | null;
  onSelect: (assetId: string) => void;
  healthById: Record<string, number | null>;
  depth?: number;
}) {
  return (
    <ul className={depth === 0 ? 'space-y-1' : 'mt-1 space-y-1'}>
      {nodes.map((node) => {
        const selected = node.id === selectedId;
        const score = healthById[node.id];
        return (
          <li key={node.id}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${selected ? 'bg-primary-light text-primary' : 'hover:bg-surface-container'}`}
              style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
              aria-pressed={selected}
              onClick={() => onSelect(node.id)}
            >
              <Boxes size={16} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{node.name}</span>
                <span className="block truncate font-mono text-xs text-text-muted">{node.code}</span>
              </span>
              {typeof score === 'number' && (
                <Badge
                  variant={healthVariant(score)}
                  size="sm"
                  dot
                  aria-label={`health ${Math.round(score)}`}
                >
                  {Math.round(score)}
                </Badge>
              )}
              <Badge variant="neutral" size="sm">{node.type}</Badge>
            </button>
            {node.children.length > 0 && (
              <AssetTree
                nodes={node.children}
                selectedId={selectedId}
                onSelect={onSelect}
                healthById={healthById}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(value: string, language: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === 'en' ? 'en-US' : language === 'zh-CN' ? 'zh-CN' : 'vi-VN');
}

export default function AssetBrowserPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const canConfigure = useAuthStore((state) => state.can('assets.configure'));
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'create-sensor' | 'edit'>('view');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const treeQuery = useQuery({
    queryKey: queryKeys.assets.tree(),
    queryFn: assetsApi.getTree,
    retry: 1,
  });
  const tree = treeQuery.data ?? EMPTY_ASSET_TREE;
  const selectedAsset = findAsset(tree, selectedId) ?? tree[0];
  const activeSelectedId = selectedAsset?.id ?? null;
  const hasHealthAssetId = Boolean(activeSelectedId && isAssetId(activeSelectedId));
  const visibleTree = useMemo(() => filterTree(tree, search.trim().toLocaleLowerCase()), [search, tree]);
  const isMachine = selectedAsset?.type === 'MACHINE';
  const isCatalogOwned = selectedAsset ? CATALOG_OWNED.has(selectedAsset.type) : false;

  // Cap fan-out: GUID nodes only, first N for tree badges (selected node still has dedicated query).
  const healthAssetIds = useMemo(() => {
    const ids = collectAssetIds(tree);
    return ids.slice(0, HEALTH_FETCH_LIMIT);
  }, [tree]);

  const treeHealthQueries = useQueries({
    queries: healthAssetIds.map((assetId) => ({
      queryKey: queryKeys.predictiveAlerts.health(assetId),
      queryFn: () => predictiveAlertsApi.getHealth(assetId),
      staleTime: 30_000,
      retry: 0,
    })),
  });

  const leafHealthScores = useMemo(() => {
    const scores: Record<string, number | null> = {};
    healthAssetIds.forEach((assetId, index) => {
      const result = treeHealthQueries[index];
      scores[assetId] = result?.data?.health_score ?? null;
    });
    return scores;
  }, [healthAssetIds, treeHealthQueries]);

  const healthById = useMemo(
    () => computeHealthRollups(tree, leafHealthScores),
    [tree, leafHealthScores],
  );

  const documentsQuery = useQuery({
    queryKey: queryKeys.assets.documents(activeSelectedId ?? ''),
    queryFn: () => assetsApi.getDocuments(activeSelectedId!),
    enabled: Boolean(activeSelectedId),
    retry: 1,
  });

  const machineQuery = useQuery({
    queryKey: queryKeys.assets.machine(activeSelectedId ?? ''),
    queryFn: () => machinesApi.getById(activeSelectedId!),
    enabled: Boolean(activeSelectedId && isMachine),
    retry: 1,
  });

  const alarmsQuery = useQuery({
    queryKey: queryKeys.assets.alarms(activeSelectedId ?? ''),
    queryFn: async () => {
      const alarms = await alarmsApi.getAll({ limit: 100 });
      return alarms.filter(
        (alarm) =>
          alarm.machineId === activeSelectedId &&
          (alarm.status === 'ACTIVE' || alarm.status === 'ACKNOWLEDGED'),
      );
    },
    enabled: Boolean(activeSelectedId && isMachine),
    retry: 1,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.predictiveAlerts.health(activeSelectedId ?? ''),
    queryFn: () => predictiveAlertsApi.getHealth(activeSelectedId!),
    enabled: hasHealthAssetId,
    retry: 1,
  });

  const refreshTree = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.assets.tree() });
    await queryClient.invalidateQueries({ queryKey: ['predictive-alerts', 'health'] });
    if (activeSelectedId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.documents(activeSelectedId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.machine(activeSelectedId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.assets.alarms(activeSelectedId) });
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      assetsApi.create({
        type: 'SENSOR',
        name: name.trim(),
        code: code.trim(),
        parentId: activeSelectedId,
        metadata: {},
      }),
    onSuccess: async (created) => {
      setActionError(null);
      setMode('view');
      setName('');
      setCode('');
      await refreshTree();
      setSelectedId(created.id);
    },
    onError: () => setActionError(t('assetBrowser.actionFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      assetsApi.update(activeSelectedId!, {
        name: name.trim(),
        code: code.trim(),
        metadata: selectedAsset?.metadata ?? {},
      }),
    onSuccess: async () => {
      setActionError(null);
      setMode('view');
      await refreshTree();
    },
    onError: () => setActionError(t('assetBrowser.actionFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => assetsApi.remove(activeSelectedId!),
    onSuccess: async () => {
      setActionError(null);
      setMode('view');
      setSelectedId(null);
      await refreshTree();
    },
    onError: () => setActionError(t('assetBrowser.actionFailed')),
  });

  const beginCreateSensor = () => {
    setActionError(null);
    setMode('create-sensor');
    setName('');
    setCode(`SENSOR-${Date.now().toString().slice(-6)}`);
  };

  const beginEdit = () => {
    if (!selectedAsset) return;
    setActionError(null);
    setMode('edit');
    setName(selectedAsset.name);
    setCode(selectedAsset.code);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('assetBrowser.eyebrow')}
        title={t('assetBrowser.title')}
        description={t('assetBrowser.description')}
        actions={(
          <Button
            variant="secondary"
            size="sm"
            loading={treeQuery.isFetching}
            startIcon={<RefreshCw size={16} aria-hidden="true" />}
            onClick={() => { void refreshTree(); }}
          >
            {t('common.actions.refresh')}
          </Button>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(19rem,0.85fr)_minmax(0,1.15fr)]">
        <Surface variant="raised" padding="none" className="overflow-hidden">
          <div className="panel-header">
            <div>
              <h2 className="title-small text-text-primary">{t('assetBrowser.treeTitle')}</h2>
              <p className="mt-1 text-xs text-text-muted">{t('assetBrowser.treeDescription')}</p>
            </div>
            <FolderTree size={18} aria-hidden="true" className="text-text-muted" />
          </div>
          <div className="border-b border-border px-4 py-3">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-surface-container-low px-3 py-2">
              <Search size={16} aria-hidden="true" className="text-text-muted" />
              <span className="sr-only">{t('assetBrowser.search')}</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                placeholder={t('assetBrowser.searchPlaceholder')}
              />
            </label>
          </div>
          <div className="max-h-[36rem] overflow-auto p-3" aria-label={t('assetBrowser.treeTitle')}>
            {treeQuery.isLoading ? (
              <DataState kind="loading" title={t('assetBrowser.loadingTree')} />
            ) : treeQuery.isError ? (
              <DataState
                kind="error"
                title={t('assetBrowser.treeUnavailable')}
                description={t('assetBrowser.treeUnavailableDescription')}
                action={<Button variant="secondary" size="sm" onClick={() => { void treeQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
              />
            ) : visibleTree.length === 0 ? (
              <DataState kind="empty" title={t('assetBrowser.noAssets')} description={t('assetBrowser.noAssetsDescription')} />
            ) : (
              <AssetTree
                nodes={visibleTree}
                selectedId={activeSelectedId}
                onSelect={(id) => { setSelectedId(id); setMode('view'); setActionError(null); }}
                healthById={healthById}
              />
            )}
          </div>
        </Surface>

        <Surface variant="raised" padding="none" className="overflow-hidden">
          {!selectedAsset ? (
            <DataState kind="empty" title={t('assetBrowser.selectAsset')} description={t('assetBrowser.selectAssetDescription')} />
          ) : (
            <>
              <div className="panel-header">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="title-small truncate text-text-primary">{selectedAsset.name}</h2>
                    <Badge variant="info" size="sm">{selectedAsset.type}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-muted">{selectedAsset.code}</p>
                </div>
              </div>

              <div className="grid gap-4 border-b border-border px-5 py-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t('assetBrowser.assetId')}</p>
                  <p className="mt-1 break-all font-mono text-xs text-text-secondary">{selectedAsset.id}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{t('assetBrowser.updatedAt')}</p>
                  <p className="mt-1 text-sm text-text-secondary">{formatDate(selectedAsset.updatedAt, i18n.language)}</p>
                </div>
              </div>

              <section className="border-b border-border px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">{t('dashboardPage.modern.healthScoreLabel')}</h3>
                  {healthQuery.data && (
                    <Badge variant={healthVariant(healthQuery.data.health_score)} size="md" dot>
                      {t('dashboardPage.modern.healthScore', { score: Math.round(healthQuery.data.health_score) })}
                    </Badge>
                  )}
                </div>
                <div className="mt-3">
                  {!hasHealthAssetId ? (
                    <DataState kind="empty" title={t('dashboardPage.modern.healthUnavailable')} />
                  ) : healthQuery.isLoading ? (
                    <DataState kind="loading" title={t('common.loading')} />
                  ) : healthQuery.isError ? (
                    <DataState
                      kind="error"
                      title={t('dashboardPage.modern.healthUnavailable')}
                      description={t('systemMonitor.healthUnavailableDescription')}
                      action={<Button variant="secondary" size="sm" onClick={() => { void healthQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
                    />
                  ) : healthQuery.data ? (
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border px-3 py-2">
                        <dt className="text-xs text-text-muted">{t('dashboardPage.modern.uptime')}</dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">{Math.round(healthQuery.data.uptime_pct)}%</dd>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <dt className="text-xs text-text-muted">{t('dashboardPage.modern.performance')}</dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">{Math.round(healthQuery.data.performance_pct)}%</dd>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <dt className="text-xs text-text-muted">{t('dashboardPage.modern.maintenance')}</dt>
                        <dd className="mt-1 text-sm font-medium text-text-primary">
                          {healthQuery.data.maintenance_overdue
                            ? t('dashboardPage.modern.maintenanceOverdue')
                            : t('dashboardPage.modern.maintenanceOnSchedule')}
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              </section>

              <section className="border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('assetBrowser.catalogActions')}</h3>
                <p className="mt-1 text-xs text-text-muted">{t('assetBrowser.catalogActionsDescription')}</p>
                {!canConfigure ? (
                  <p className="mt-3 text-xs text-text-muted">{t('assetBrowser.roleDenied')}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" startIcon={<Plus size={14} aria-hidden="true" />} onClick={beginCreateSensor}>
                      {t('assetBrowser.createSensor')}
                    </Button>
                    {isCatalogOwned && (
                      <>
                        <Button size="sm" variant="secondary" startIcon={<Pencil size={14} aria-hidden="true" />} onClick={beginEdit}>
                          {t('assetBrowser.editAsset')}
                        </Button>
                        {selectedAsset.type !== 'PLANT' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={deleteMutation.isPending}
                            startIcon={<Trash2 size={14} aria-hidden="true" />}
                            onClick={() => { void deleteMutation.mutateAsync(); }}
                          >
                            {t('assetBrowser.deleteAsset')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
                {actionError && <p className="mt-3 text-xs text-error">{actionError}</p>}
                {mode !== 'view' && canConfigure && (
                  <div className="mt-4 grid gap-3 rounded-lg border border-border bg-surface-container-low p-3 sm:grid-cols-2">
                    <label className="text-xs text-text-muted">
                      {t('assetBrowser.nameLabel')}
                      <input
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <label className="text-xs text-text-muted">
                      {t('assetBrowser.codeLabel')}
                      <input
                        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button
                        size="sm"
                        loading={createMutation.isPending || updateMutation.isPending}
                        disabled={!name.trim() || !code.trim()}
                        onClick={() => {
                          if (mode === 'create-sensor') void createMutation.mutateAsync();
                          else void updateMutation.mutateAsync();
                        }}
                      >
                        {mode === 'create-sensor' ? t('assetBrowser.create') : t('assetBrowser.save')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setMode('view'); setActionError(null); }}>
                        {t('assetBrowser.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              <section className="border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('assetBrowser.telemetry')}</h3>
                <p className="mt-1 text-xs text-text-muted">{t('assetBrowser.telemetryDescription')}</p>
                <div className="mt-3">
                  {!isMachine ? (
                    <DataState kind="empty" title={t('assetBrowser.noTelemetry')} description={t('assetBrowser.noTelemetryDescription')} />
                  ) : machineQuery.isLoading ? (
                    <DataState kind="loading" title={t('assetBrowser.loadingTelemetry')} />
                  ) : machineQuery.isError ? (
                    <DataState kind="error" title={t('assetBrowser.telemetryUnavailable')} description={t('assetBrowser.telemetryUnavailableDescription')} />
                  ) : machineQuery.data ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-xs text-text-muted">{t('assetBrowser.status')}</p>
                        <p className="mt-1 text-sm font-medium text-text-primary">{machineQuery.data.status}</p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-xs text-text-muted">{t('assetBrowser.plc')}</p>
                        <p className="mt-1 text-sm font-medium text-text-primary">
                          {machineQuery.data.plcConnected ? t('assetBrowser.connected') : t('assetBrowser.disconnected')}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border px-3 py-2">
                        <p className="text-xs text-text-muted">
                          {t('equipment.fields.cpu')} / {t('equipment.fields.ram')}
                        </p>
                        <p className="mt-1 text-sm font-medium text-text-primary">
                          {machineQuery.data.cpuPercent}% / {machineQuery.data.ramPercent}%
                        </p>
                      </div>
                    </div>
                  ) : (
                    <DataState kind="empty" title={t('assetBrowser.noTelemetry')} description={t('assetBrowser.noTelemetryDescription')} />
                  )}
                </div>
              </section>

              <section className="border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('assetBrowser.alarms')}</h3>
                <p className="mt-1 text-xs text-text-muted">{t('assetBrowser.alarmsDescription')}</p>
                <div className="mt-3">
                  {!isMachine ? (
                    <DataState kind="empty" title={t('assetBrowser.noAlarms')} description={t('assetBrowser.noAlarmsDescription')} />
                  ) : alarmsQuery.isLoading ? (
                    <DataState kind="loading" title={t('assetBrowser.loadingAlarms')} />
                  ) : alarmsQuery.isError ? (
                    <DataState kind="error" title={t('assetBrowser.alarmsUnavailable')} description={t('assetBrowser.alarmsUnavailableDescription')} />
                  ) : (alarmsQuery.data ?? []).length === 0 ? (
                    <DataState kind="empty" title={t('assetBrowser.noAlarms')} description={t('assetBrowser.noAlarmsDescription')} />
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {alarmsQuery.data?.map((alarm) => (
                        <li key={alarm.id} className="flex items-center gap-3 px-3 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-text-primary">{alarm.message}</span>
                            <span className="block text-xs text-text-muted">{formatDate(alarm.createdAt, i18n.language)}</span>
                          </span>
                          <Badge variant="neutral" size="sm">{alarm.severity}</Badge>
                          <Badge variant="info" size="sm">{alarm.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="border-b border-border px-5 py-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('assetBrowser.metadata')}</h3>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-container-low p-3 text-xs text-text-secondary">
                  {JSON.stringify(selectedAsset.metadata, null, 2)}
                </pre>
              </section>

              <section className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{t('assetBrowser.documents')}</h3>
                    <p className="mt-1 text-xs text-text-muted">{t('assetBrowser.documentsDescription')}</p>
                  </div>
                  <FileText size={18} aria-hidden="true" className="text-text-muted" />
                </div>
                <div className="mt-3">
                  {documentsQuery.isLoading ? (
                    <DataState kind="loading" title={t('assetBrowser.loadingDocuments')} />
                  ) : documentsQuery.isError ? (
                    <DataState
                      kind="error"
                      title={t('assetBrowser.documentsUnavailable')}
                      description={t('assetBrowser.documentsUnavailableDescription')}
                      action={<Button variant="secondary" size="sm" onClick={() => { void documentsQuery.refetch(); }}>{t('common.actions.retry')}</Button>}
                    />
                  ) : (documentsQuery.data ?? []).length === 0 ? (
                    <DataState kind="empty" title={t('assetBrowser.noDocuments')} description={t('assetBrowser.noDocumentsDescription')} />
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {documentsQuery.data?.map((document) => (
                        <li key={`${document.relationship}-${document.documentId}`} className="flex items-center gap-3 px-3 py-3">
                          <FileText size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-sm text-text-primary">{document.documentId}</span>
                            <span className="block text-xs text-text-muted">{formatDate(document.createdAt, i18n.language)}</span>
                          </span>
                          <Badge variant="neutral" size="sm">{document.relationship}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </>
          )}
        </Surface>
      </div>
    </div>
  );
}
