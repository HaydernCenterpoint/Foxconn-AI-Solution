import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ThroughputDataPoint {
  time: string;
  value: number;
}

interface Props {
  data: ThroughputDataPoint[];
  title: string;
}

function ThroughputChartComponent({ data, title }: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="flex h-full flex-col rounded-xl border p-4"
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-outline-variant)',
      }}
    >
      <h3 className="mb-4 text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>
        {title}
      </h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-outline-variant)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '8px',
              }}
              labelStyle={{ color: 'var(--color-on-surface)' }}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={t('dashboard.charts.throughput')}
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, fill: 'var(--color-primary)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const ThroughputChart = memo(ThroughputChartComponent);
