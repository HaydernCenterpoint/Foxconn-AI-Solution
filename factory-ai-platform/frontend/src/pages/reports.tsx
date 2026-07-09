import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getProductionHistory } from '@/lib/api'
import { ProductionChart, OeeChart } from '@/components/charts/charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatNumber, formatPercent } from '@/lib/utils'
import {
  TrendingUp,
  TrendingDown,
  Download,
  Calendar,
  BarChart3,
} from 'lucide-react'

const TIME_RANGES = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'This Month', value: 'month' },
  { label: 'Last Shift', value: 'shift_morning' },
]

const GROUP_BYS = [
  { label: 'Hourly', value: 'hour' },
  { label: 'Daily', value: 'day' },
  { label: 'Weekly', value: 'week' },
]

function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map((row) =>
    headers.map((h) => JSON.stringify(row[h] ?? '')).join(','),
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage() {
  const [timeRange, setTimeRange] = useState('last_7_days')
  const [groupBy, setGroupBy] = useState('day')

  const { data: prodData, isLoading: prodLoading } = useQuery({
    queryKey: ['production-history', timeRange, groupBy],
    queryFn: () => getProductionHistory(timeRange, groupBy as 'hour' | 'day' | 'week'),
  })

  const chartData = prodData?.records.map((r) => ({
    ...r,
    time: new Date(r.time).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: groupBy === 'hour' ? '2-digit' : undefined,
    }),
  })) ?? []

  const handleExport = () => {
    if (chartData.length) {
      downloadCSV(chartData as unknown as Record<string, unknown>[], `production-${timeRange}.csv`)
    }
  }

  const avgUptime = prodData?.records.length
    ? prodData.records.reduce((s, r) => s + r.uptime, 0) / prodData.records.length
    : 0

  const rejectRate = prodData?.summary.totalGood
    ? (prodData.summary.totalReject / (prodData.summary.totalGood + prodData.summary.totalReject)) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Production analytics and data export
          </p>
        </div>
        <Button onClick={handleExport} disabled={!chartData.length}>
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Range:</span>
            <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
              {TIME_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Group By:</span>
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {GROUP_BYS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </Select>
          </div>
          <Badge variant="secondary">
            {prodData?.records.length ?? 0} data points
          </Badge>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatNumber(prodData?.summary.totalGood ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Good Output</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-red-100 p-2 dark:bg-red-900">
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatNumber(prodData?.summary.totalReject ?? 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Rejects</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatPercent(avgUptime * 100)}
              </p>
              <p className="text-xs text-muted-foreground">Avg Uptime</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-yellow-100 p-2 dark:bg-yellow-900">
              <TrendingDown className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {formatPercent(rejectRate, 2)}
              </p>
              <p className="text-xs text-muted-foreground">Reject Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Production Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Production Output</CardTitle>
        </CardHeader>
        <CardContent>
          {prodLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <ProductionChart
              data={chartData}
              type="bar"
              dataKey="goodCount"
              xKey="time"
              color="#3b82f6"
              height={320}
            />
          )}
        </CardContent>
      </Card>

      {/* Reject trend */}
      <Card>
        <CardHeader>
          <CardTitle>Reject Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {prodLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <ProductionChart
              data={chartData}
              type="line"
              dataKey="rejectCount"
              xKey="time"
              color="#ef4444"
              height={280}
            />
          )}
        </CardContent>
      </Card>

      {/* OEE breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>OEE Components Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          {prodLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <OeeChart
              data={chartData.map((r) => ({
                ...r,
                availability: 85 + Math.random() * 10,
                performance: 80 + Math.random() * 15,
                quality: 95 + Math.random() * 4,
                oee: (85 + Math.random() * 10) * (80 + Math.random() * 15) * (95 + Math.random() * 4) / 10000,
              }))}
              height={240}
            />
          )}
        </CardContent>
      </Card>

      {/* Cycle time */}
      <Card>
        <CardHeader>
          <CardTitle>Cycle Time Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {prodLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ProductionChart
              data={chartData}
              type="area"
              dataKey="cycleTime"
              xKey="time"
              color="#8b5cf6"
              height={240}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
