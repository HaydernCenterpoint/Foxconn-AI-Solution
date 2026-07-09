import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAssets, getLiveTelemetry, getAlarms } from '@/lib/api'
import type { Asset } from '@/lib/contracts'
import { cn, formatDate, severityColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronRight,
  ChevronDown,
  Server,
  Factory,
  Cpu,
  Search,
  Activity,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Tree Node
// ---------------------------------------------------------------------------

interface TreeNodeData extends Asset {
  children?: TreeNodeData[]
}

function buildTree(assets: Asset[]): TreeNodeData[] {
  const map = new Map<string, TreeNodeData>()
  const roots: TreeNodeData[] = []

  assets.forEach((a) => map.set(a.id, { ...a, children: [] }))

  map.forEach((node) => {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children!.push(node)
    } else if (!node.parentId) {
      roots.push(node)
    }
  })

  return roots
}

const TYPE_ICONS = {
  plant: Factory,
  line: Server,
  machine: Cpu,
  sensor: Activity,
}

const TYPE_COLORS = {
  plant: 'text-blue-600',
  line: 'text-green-600',
  machine: 'text-orange-600',
  sensor: 'text-purple-600',
}

interface TreeNodeProps {
  node: TreeNodeData
  level: number
  selectedId: string | null
  onSelect: (asset: Asset) => void
}

function TreeNode({ node, level, selectedId, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2)
  const hasChildren = (node.children?.length ?? 0) > 0
  const isSelected = selectedId === node.id
  const Icon = TYPE_ICONS[node.type] ?? Server

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          onSelect(node)
        }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent',
          isSelected && 'bg-accent font-medium',
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Icon className={cn('h-4 w-4 shrink-0', TYPE_COLORS[node.type])} />
        <span className="truncate">{node.name}</span>
        {hasChildren && (
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {node.children!.length}
          </Badge>
        )}
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail Panel
// ---------------------------------------------------------------------------

interface DetailPanelProps {
  asset: Asset
  onClose: () => void
}

function DetailPanel({ asset, onClose }: DetailPanelProps) {
  const { data: telemetries } = useQuery({
    queryKey: ['live-telemetry'],
    queryFn: getLiveTelemetry,
    refetchInterval: 5000,
  })

  const { data: alarms = [] } = useQuery({
    queryKey: ['alarms', asset.id],
    queryFn: () => getAlarms({ lineCode: asset.name }),
    enabled: asset.type === 'machine',
  })

  const machine = telemetries?.find((t) => t.machineId === asset.id)
  const machineAlarms = alarms.filter((a) => a.assetId === asset.id || a.machineName === asset.name)

  const Icon = TYPE_ICONS[asset.type] ?? Server

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', TYPE_COLORS[asset.type])} />
          <div>
            <h2 className="font-semibold">{asset.name}</h2>
            <p className="text-xs text-muted-foreground capitalize">{asset.type}</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Metadata */}
        {Object.keys(asset.metadata).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {Object.entries(asset.metadata).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{String(v)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Live metrics */}
        {machine && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Live Telemetry
                <Badge
                  className={cn(
                    'ml-auto text-[10px]',
                    machine.status === 'RUNNING'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                      : machine.status === 'IDLE'
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
                  )}
                >
                  {machine.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {machine.metrics.oee !== undefined && (
                  <MetricItem label="OEE" value={`${machine.metrics.oee.toFixed(1)}%`} />
                )}
                {machine.metrics.cycleTime !== undefined && (
                  <MetricItem label="Cycle Time" value={`${machine.metrics.cycleTime.toFixed(1)}s`} />
                )}
                {machine.metrics.temperature !== undefined && (
                  <MetricItem label="Temperature" value={`${machine.metrics.temperature.toFixed(1)}°C`} />
                )}
                {machine.metrics.vibration !== undefined && (
                  <MetricItem label="Vibration" value={`${machine.metrics.vibration.toFixed(2)} mm/s`} />
                )}
                {machine.metrics.availability !== undefined && (
                  <MetricItem label="Availability" value={`${machine.metrics.availability.toFixed(1)}%`} />
                )}
                {machine.metrics.performance !== undefined && (
                  <MetricItem label="Performance" value={`${machine.metrics.performance.toFixed(1)}%`} />
                )}
                {machine.metrics.quality !== undefined && (
                  <MetricItem label="Quality" value={`${machine.metrics.quality.toFixed(1)}%`} />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Last updated: {formatDate(machine.timestamp)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Alarms */}
        {machineAlarms.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Alarms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {machineAlarms.slice(0, 5).map((alarm) => (
                <div key={alarm.id} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{alarm.machineName}</span>
                      <Badge className={severityColor(alarm.severity)} variant="outline">
                        {alarm.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{alarm.message}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono text-xs">{asset.id.slice(0, 8)}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(asset.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Asset Browser Page
// ---------------------------------------------------------------------------

export function AssetBrowserPage() {
  const [selected, setSelected] = useState<Asset | null>(null)
  const [search, setSearch] = useState('')

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: getAssets,
  })

  const handleSelect = useCallback((asset: Asset) => {
    setSelected(asset)
  }, [])

  const tree = buildTree(assets)
  const filteredTree = search.trim()
    ? filterTree(tree, search.toLowerCase())
    : tree

  return (
    <div className="flex h-full gap-6">
      {/* Left panel: tree */}
      <div className="w-72 shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Browser</h1>
          <p className="text-sm text-muted-foreground">
            {assets.length} assets in hierarchy
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tree */}
        <div className="rounded-lg border bg-card overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {isLoading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <div className="p-2">
              {filteredTree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  selectedId={selected?.id ?? null}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: detail */}
      <div className="flex-1 rounded-lg border bg-card overflow-hidden">
        {selected ? (
          <DetailPanel asset={selected} onClose={() => setSelected(null)} />
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <Server className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm text-muted-foreground">
                Select an asset from the tree to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function filterTree(nodes: TreeNodeData[], query: string): TreeNodeData[] {
  const result: TreeNodeData[] = []
  for (const node of nodes) {
    const matches = node.name.toLowerCase().includes(query)
    const filteredChildren = filterTree(node.children ?? [], query)
    if (matches || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children })
    }
  }
  return result
}
