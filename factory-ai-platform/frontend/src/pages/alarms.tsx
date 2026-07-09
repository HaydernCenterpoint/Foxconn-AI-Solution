import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAlarms, acknowledgeAlarm } from '@/lib/api'
import type { AlarmSeverity, AlarmStatus } from '@/lib/contracts'
import { cn, formatDate, severityColor } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle,
  Search,
  Filter,
  XCircle,
} from 'lucide-react'

const SEVERITIES: AlarmSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const STATUSES: AlarmStatus[] = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']

const STATUS_ICONS = {
  ACTIVE: AlertTriangle,
  ACKNOWLEDGED: Bell,
  RESOLVED: CheckCircle,
}

export function AlarmsPage() {
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const pageSize = 15

  const queryClient = useQueryClient()

  const { data: alarms = [], isLoading } = useQuery({
    queryKey: ['alarms', severityFilter, statusFilter],
    queryFn: () =>
      getAlarms({
        severity: severityFilter || undefined,
        status: statusFilter || undefined,
      }),
  })

  const ackMutation = useMutation({
    mutationFn: (id: string) => acknowledgeAlarm(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarms'] }),
  })

  const filtered = alarms.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      a.machineName.toLowerCase().includes(q) ||
      a.message.toLowerCase().includes(q) ||
      a.lineCode.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    )
  })

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  const counts = {
    total: alarms.length,
    active: alarms.filter((a) => a.status === 'ACTIVE').length,
    critical: alarms.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length,
    resolved: alarms.filter((a) => a.status === 'RESOLVED').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alarms</h1>
        <p className="text-sm text-muted-foreground">
          Monitor and manage system alarms
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card
          className={cn(
            'cursor-pointer transition-colors',
            !severityFilter && !statusFilter && 'ring-2 ring-primary',
          )}
          onClick={() => {
            setSeverityFilter('')
            setStatusFilter('')
            setPage(0)
          }}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
              <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'cursor-pointer transition-colors',
            statusFilter === 'ACTIVE' && 'ring-2 ring-red-500',
          )}
          onClick={() => {
            setStatusFilter(statusFilter === 'ACTIVE' ? '' : 'ACTIVE')
            setPage(0)
          }}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-900">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors"
          onClick={() => {
            setSeverityFilter('CRITICAL')
            setStatusFilter('ACTIVE')
            setPage(0)
          }}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-red-200 p-2 dark:bg-red-800">
              <XCircle className="h-4 w-4 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.critical}</p>
              <p className="text-xs text-muted-foreground">Critical</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors"
          onClick={() => {
            setStatusFilter('RESOLVED')
            setPage(0)
          }}
        >
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.resolved}</p>
              <p className="text-xs text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search alarms..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={severityFilter} onChange={(e) => { setSeverityFilter(e.target.value); setPage(0) }}>
            <option value="">All Severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0) }}>
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>

        {(severityFilter || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSeverityFilter(''); setStatusFilter(''); setPage(0) }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground/30" />
              <p className="mt-4 text-sm text-muted-foreground">No alarms found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((alarm) => {
                  const StatusIcon = STATUS_ICONS[alarm.status]
                  return (
                    <TableRow key={alarm.id}>
                      <TableCell>
                        <Badge className={severityColor(alarm.severity)} variant="outline">
                          {alarm.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{alarm.machineName}</p>
                          <p className="text-xs text-muted-foreground">{alarm.lineCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{alarm.type}</span>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <p className="truncate text-sm text-muted-foreground">{alarm.message}</p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            alarm.status === 'ACTIVE' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
                            alarm.status === 'ACKNOWLEDGED' && 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
                            alarm.status === 'RESOLVED' && 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
                          )}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {alarm.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground">{formatDate(alarm.timestamp)}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        {alarm.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => ackMutation.mutate(alarm.id)}
                            disabled={ackMutation.isPending}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span className="text-sm">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
