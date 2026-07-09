import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

interface ChartProps {
  data: unknown[]
  type?: 'area' | 'bar' | 'line'
  dataKey: string
  xKey?: string
  yKey?: string
  color?: string
  height?: number
  title?: string
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-2 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

export function ProductionChart({
  data,
  type = 'area',
  dataKey,
  xKey = 'time',
  color = '#3b82f6',
  height = 300,
  title,
}: ChartProps) {
  const formatX = (val: string) => {
    try {
      const d = new Date(val)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return val
    }
  }

  const sharedProps = {
    data,
    margin: { top: 10, right: 10, left: 0, bottom: 0 },
  }

  const axisProps = {
    tick: { fontSize: 11, fill: 'currentColor' },
    tickLine: false,
    axisLine: { stroke: 'hsl(var(--border))' },
  }

  return (
    <div>
      {title && <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>}
      <ResponsiveContainer width="100%" height={height}>
        {type === 'area' ? (
          <AreaChart {...sharedProps}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={formatX} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={`url(#grad-${dataKey})`}
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        ) : type === 'bar' ? (
          <BarChart {...sharedProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={formatX} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart {...sharedProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey={xKey} tickFormatter={formatX} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

export function OeeChart({
  data,
  height = 200,
}: {
  data: { time: string; availability: number; performance: number; quality: number; oee: number }[]
  height?: number
}) {
  const formatX = (val: string) => {
    try {
      return new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return val
    }
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-avail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-perf" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grad-qual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="time"
          tickFormatter={formatX}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'currentColor' }}
          tickLine={false}
          axisLine={{ stroke: 'hsl(var(--border))' }}
          domain={[0, 100]}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="availability" name="Availability" stroke="#10b981" fill="url(#grad-avail)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="performance" name="Performance" stroke="#3b82f6" fill="url(#grad-perf)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="quality" name="Quality" stroke="#8b5cf6" fill="url(#grad-qual)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
