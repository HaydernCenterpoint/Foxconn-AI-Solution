import type { DashboardSummary, TelemetrySnapshot } from '@/lib/contracts'
import { formatNumber, formatPercent, severityColor, healthColor } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  XCircle,
} from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export function KpiCard({ title, value, subtitle, icon, trend, variant = 'default' }: KpiCardProps) {
  const iconBg = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400',
  }[variant]

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend !== undefined && (
              <div className="mt-1 flex items-center gap-1">
                {trend >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingUp className="h-3 w-3 rotate-180 text-red-500" />
                )}
                <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {Math.abs(trend).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div className={`rounded-lg p-2 ${iconBg}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

interface MachineStatusProps {
  machine: TelemetrySnapshot
  onClick?: () => void
}

export function MachineStatusCard({ machine, onClick }: MachineStatusProps) {
  const isRunning = machine.status === 'RUNNING'
  const statusColor = isRunning
    ? 'bg-green-500'
    : machine.status === 'IDLE'
    ? 'bg-yellow-500'
    : 'bg-red-500'

  const healthScore = machine.metrics.oee ?? 0
  const healthClass = healthColor(healthScore)

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        <div className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
        <div>
          <p className="text-sm font-medium">{machine.machineName}</p>
          <p className="text-xs text-muted-foreground">{machine.lineCode}</p>
        </div>
      </div>
      <div className="text-right">
        <Badge className={healthClass}>
          {formatPercent(healthScore, 0)}
        </Badge>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {machine.metrics.cycleTime
            ? `${machine.metrics.cycleTime.toFixed(1)}s cycle`
            : machine.status}
        </p>
      </div>
    </div>
  )
}

interface LineStatusProps {
  line: DashboardSummary['lines'][number]
}

export function LineStatusCard({ line }: LineStatusProps) {
  const pct = Math.round((line.production / line.target) * 100)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{line.lineCode}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {line.running}/{line.machines} machines running
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Production</span>
          <span className="font-medium">
            {formatNumber(line.production)} / {formatNumber(line.target)}
          </span>
        </div>
        <Progress value={pct} />
        <p className="text-right text-xs text-muted-foreground">{pct}% of target</p>
      </CardContent>
    </Card>
  )
}

interface AlarmListItemProps {
  alarm: {
    id: string
    machineName: string
    lineCode: string
    message: string
    severity: string
    timestamp: string
    status: string
  }
  onAcknowledge?: (id: string) => void
}

export function AlarmListItem({ alarm, onAcknowledge }: AlarmListItemProps) {
  const sev = severityColor(alarm.severity)
  const timeAgo = (() => {
    const diff = Date.now() - new Date(alarm.timestamp).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  })()

  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/30">
      <div className="mt-0.5">
        {alarm.status === 'ACTIVE' ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : alarm.status === 'ACKNOWLEDGED' ? (
          <Activity className="h-4 w-4 text-yellow-500" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{alarm.machineName}</span>
          <Badge className={sev} variant="outline">{alarm.severity}</Badge>
          <span className="text-xs text-muted-foreground">{alarm.lineCode}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{alarm.message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{timeAgo}</p>
      </div>
      {alarm.status === 'ACTIVE' && onAcknowledge && (
        <button
          onClick={() => onAcknowledge(alarm.id)}
          className="shrink-0 rounded border px-2 py-1 text-xs font-medium hover:bg-accent transition-colors"
        >
          Ack
        </button>
      )}
    </div>
  )
}

interface HealthBadgeProps {
  score: number
  size?: 'sm' | 'md'
}

export function HealthBadge({ score, size = 'md' }: HealthBadgeProps) {
  const cls = healthColor(score)
  const label =
    score >= 80 ? 'Healthy' : score >= 60 ? 'Warning' : 'Critical'
  const Icon = score >= 60 ? CheckCircle : XCircle

  return (
    <Badge className={`${cls} ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : ''}`}>
      <Icon className={`${size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'} mr-1`} />
      {label} {score.toFixed(0)}%
    </Badge>
  )
}
