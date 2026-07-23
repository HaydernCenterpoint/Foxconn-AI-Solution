import { useState, useMemo, useCallback, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  ChevronDown,
  Search,
  Factory,
  Layers,
  Cpu,
  Gauge,
  MapPin,
  FileText,
  AlertTriangle,
  Activity,
  Package,
} from 'lucide-react';
import { api } from '../shared/services/apiClient';
import { TechPanel } from '../shared/components/ui/TechPanel';
import { Badge } from '../shared/components/ui/Badge';
import { LoadingState, EmptyState } from '../shared/components/ui/EmptyState';

// ── Types ────────────────────────────────────────────────────────────

interface AssetTreeNode {
  id: string;
  type: string;
  name: string;
  code: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  parentId: string | null;
  children: AssetTreeNode[];
}

interface AssetDocument {
  id: string;
  assetId: string;
  title: string;
  docType: string;
  url: string;
  uploadedBy: string | null;
  uploadedAt: string;
}

interface EventLogEntry {
  eventId: string;
  timestamp: string;
  eventType: string;
  severity: string;
  source: string | null;
  payload: string | null;
}

// ── Icon helper ──────────────────────────────────────────────────────

function assetIcon(type: string) {
  switch (type.toUpperCase()) {
    case 'PLANT':
      return Factory;
    case 'AREA':
      return MapPin;
    case 'LINE':
      return Layers;
    case 'MACHINE':
      return Cpu;
    case 'SENSOR':
      return Gauge;
    default:
      return Package;
  }
}

// ── Tree Node Component ──────────────────────────────────────────────

function TreeNode({
  node,
  level,
  selectedId,
  onSelect,
  searchTerm,
}: {
  node: AssetTreeNode;
  level: number;
  selectedId: string | null;
  onSelect: (node: AssetTreeNode) => void;
  searchTerm: string;
}) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children && node.children.length > 0;
  const Icon = assetIcon(node.type);
  const isSelected = selectedId === node.id;

  const matchesSearch =
    !searchTerm ||
    node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    node.code.toLowerCase().includes(searchTerm.toLowerCase());

  const childMatchesSearch = useMemo(() => {
    if (!searchTerm) return true;
    const check = (n: AssetTreeNode): boolean =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.children || []).some(check);
    return check(node);
  }, [node, searchTerm]);

  if (searchTerm && !matchesSearch && !childMatchesSearch) return null;

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors
          ${isSelected ? 'bg-cyan-900/40 text-cyan-300' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => {
          onSelect(node);
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-500" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className="w-4 h-4 shrink-0 text-cyan-400" />
        <span className="truncate">{node.name}</span>
        <span className="ml-auto text-[10px] text-gray-500 uppercase shrink-0">{node.type}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────

function DetailPanel({ asset }: { asset: AssetTreeNode }) {
  const { t } = useTranslation();
  const Icon = assetIcon(asset.type);

  const { data: documents = [] } = useQuery<AssetDocument[]>({
    queryKey: ['asset-documents', asset.id],
    queryFn: async () => (await api.get(`/assets/${asset.id}/documents`)).data,
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery<EventLogEntry[]>({
    queryKey: ['asset-events', asset.id],
    queryFn: async () => (await api.get(`/events?assetId=${asset.id}&limit=10`)).data,
    staleTime: 15_000,
  });

  const meta = asset.metadata || {};
  const metaEntries = Object.entries(meta).filter(
    ([k]) => !['id', 'createdAt', 'updatedAt'].includes(k),
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-700/50">
        <div className="w-10 h-10 rounded-lg bg-cyan-900/30 flex items-center justify-center">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white truncate">{asset.name}</h2>
          <p className="text-xs text-gray-400 font-mono">{asset.code}</p>
        </div>
        <Badge variant="default" className="uppercase text-[10px]">
          {asset.type}
        </Badge>
      </div>

      {/* Metadata */}
      <TechPanel title={t('common.table.details', 'Details')}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm p-3">
          <MetaRow label="ID" value={asset.id} mono />
          <MetaRow label="Type" value={asset.type} />
          <MetaRow label="Code" value={asset.code} mono />
          <MetaRow label="Created" value={new Date(asset.createdAt).toLocaleDateString()} />
          {metaEntries.map(([k, v]) => (
            <MetaRow key={k} label={k} value={String(v ?? '-')} />
          ))}
        </div>
      </TechPanel>

      {/* Active Events / Alarms */}
      <TechPanel title="Active Events" extraHeader={<Activity className="w-4 h-4 text-cyan-400" />}>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500 p-3">No recent events</p>
        ) : (
          <div className="divide-y divide-gray-700/40">
            {events.map((evt) => (
              <div key={evt.eventId} className="flex items-center gap-2 px-3 py-2 text-sm">
                <SeverityDot severity={evt.severity} />
                <span className="text-gray-300 truncate flex-1">{evt.eventType}</span>
                <span className="text-[10px] text-gray-500">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </TechPanel>

      {/* Linked Documents */}
      <TechPanel title="Documents" extraHeader={<FileText className="w-4 h-4 text-cyan-400" />}>
        {documents.length === 0 ? (
          <p className="text-sm text-gray-500 p-3">No linked documents</p>
        ) : (
          <div className="divide-y divide-gray-700/40">
            {documents.map((doc) => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{doc.title}</span>
                <Badge variant="default" className="ml-auto text-[10px]">
                  {doc.docType}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </TechPanel>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={`text-gray-200 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const color =
    severity === 'EMERGENCY'
      ? 'bg-red-500'
      : severity === 'CRITICAL'
        ? 'bg-orange-500'
        : severity === 'WARNING'
          ? 'bg-yellow-500'
          : 'bg-blue-500';
  return <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />;
}

// ── Main Page ────────────────────────────────────────────────────────

export function AssetBrowserPage() {
  const { t } = useTranslation();
  const [selectedAsset, setSelectedAsset] = useState<AssetTreeNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: tree = [],
    isLoading,
    error,
  } = useQuery<AssetTreeNode[]>({
    queryKey: ['asset-tree'],
    queryFn: async () => (await api.get('/assets/tree')).data,
    staleTime: 60_000,
  });

  const handleSelect = useCallback((node: AssetTreeNode) => {
    setSelectedAsset(node);
  }, []);

  if (isLoading) return <LoadingState />;
  if (error) return <EmptyState title="Error" description="Failed to load asset tree" />;

  return (
    <div className="h-full flex flex-col gap-4 p-4 lg:p-6 overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">{t('titles.assets', 'Asset Browser')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('common.table.total', 'Total')}: {countNodes(tree)}{' '}
            {t('navigation.assets', 'assets').toLowerCase()}
          </p>
        </div>
      </div>

      {/* Content: tree + detail */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Tree view */}
        <div className="w-72 xl:w-80 shrink-0 flex flex-col bg-[#1a1a1a] rounded-xl border border-gray-700/40 overflow-hidden">
          {/* Search */}
          <div className="p-3 border-b border-gray-700/40">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder={t('common.search', 'Search') + '...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-white/5 border border-gray-700/50 rounded-md text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto p-1.5">
            {tree.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {t('common.noData', 'No data')}
              </p>
            ) : (
              tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  selectedId={selectedAsset?.id ?? null}
                  onSelect={handleSelect}
                  searchTerm={searchTerm}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="flex-1 bg-[#1a1a1a] rounded-xl border border-gray-700/40 overflow-y-auto p-4">
          {selectedAsset ? (
            <DetailPanel asset={selectedAsset} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-600" />
                <p className="text-sm">Select an asset from the tree to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function countNodes(nodes: AssetTreeNode[]): number {
  let count = 0;
  for (const n of nodes) {
    count += 1;
    if (n.children) count += countNodes(n.children);
  }
  return count;
}

export default AssetBrowserPage;
