import { useQuery } from '@tanstack/react-query'
import { getDashboardSummary, getLiveTelemetry, getProductionHistory, getActiveAlarms } from '@/lib/api'
import { KpiCard, LineStatusCard, MachineStatusCard, AlarmListItem } from '@/components/dashboard/dashboard-cards'
import { ProductionChart } from '@/components/charts/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber, formatPercent } from '@/lib/utils'
import {
  Factory,
  Activity,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react'

export function DashboardPage() {
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 30000,
  })

  const { data: telemetries = [], isLoading: telLoading } = useQuery({
    queryKey: ['live-telemetry'],
    queryFn: getLiveTelemetry,
    refetchInterval: 5000,
  })

  const { data: prodData } = useQuery({
    queryKey: ['production-history'],
    queryFn: () => getProductionHistory('last_7_days', 'day'),
    refetchInterval: 60000,
  })

  const { data: alarms = [] } = useQuery({
    queryKey: ['active-alarms'],
    queryFn: getActiveAlarms,
    refetchInterval: 15000,
  })

  const activeAlarms = alarms.filter((a) => a.status === 'ACTIVE')
  const criticalAlarms = activeAlarms.filter((a) => a.severity === 'CRITICAL')

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Real-time overview of MKZ Factory operations
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sumLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : summary ? (
          <>
            <KpiCard
              title="Total Machines"
              value={summary.totalMachines}
              subtitle={`${summary.runningMachines} running`}
              icon={<Factory className="h-5 w-5" />}
              variant="default"
            />
            <KpiCard
              title="Active Alarms"
              value={summary.activeAlarms}
              subtitle={`${summary.criticalAlarms} critical`}
              icon={<AlertTriangle className="h-5 w-5" />}
              variant={summary.criticalAlarms > 0 ? 'danger' : 'default'}
            />
            <KpiCard
              title="Today's Production"
              value={formatNumber(summary.todayProduction)}
              subtitle={`of ${formatNumber(summary.todayTarget)} target`}
              icon={<Activity className="h-5 w-5" />}
              variant="default"
            />
            <KpiCard
              title="Avg OEE"
              value={formatPercent(summary.avgOee)}
              icon={<CheckCircle className="h-5 w-5" />}
              variant={summary.avgOee >= 80 ? 'success' : summary.avgOee >= 60 ? 'warning' : 'danger'}
            />
          </>
        ) : null}
      </div>

      {/* Main grid: chart + line status */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Production Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Production History — Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {prodData?.records ? (
              <ProductionChart
                data={prodData.records.map((r) => ({
                  ...r,
                  time: new Date(r.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                }))}
                type="bar"
                dataKey="goodCount"
                xKey="time"
                color="#3b82f6"
                height={280}
              />
            ) : (
              <Skeleton className="h-72 w-full" />
            )}
          </CardContent>
        </Card>

        {/* Line Status */}
        <div className="space-y-4">
          <CardHeader className="px-0">
            <CardTitle>Line Status</CardTitle>
          </CardHeader>
          {summary?.lines.map((line) => (
            <LineStatusCard key={line.lineId} line={line} />
          ))}
        </div>
      </div>

      {/* Machine status + alarms */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Live Machine Status */}
        <Card>
          <CardHeader>
            <CardTitle>Live Machine Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {telLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : (
              telemetries.slice(0, 7).map((t) => (
                <MachineStatusCard key={t.machineId} machine={t} />
              ))
            )}
          </CardContent>
        </Card>

        {/* Active Alarms */}
        <Card>
          <CardHeader>
            <CardTitle>
              Active Alarms
              {criticalAlarms.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                  {criticalAlarms.length} critical
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeAlarms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <p className="mt-2 text-sm text-muted-foreground">No active alarms</p>
              </div>
            ) : (
              activeAlarms.slice(0, 6).map((alarm) => (
                <AlarmListItem
                  key={alarm.id}
                  alarm={{
                    id: alarm.id,
                    machineName: alarm.machineName,
                    lineCode: alarm.lineCode,
                    message: alarm.message,
                    severity: alarm.severity,
                    timestamp: alarm.timestamp,
                    status: alarm.status,
                  }}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
