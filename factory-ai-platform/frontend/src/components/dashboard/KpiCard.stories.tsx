import type { Meta, StoryObj } from '@storybook/react'
import { KpiCard } from './dashboard-cards'
import { Factory, AlertTriangle, Activity } from 'lucide-react'

const meta: Meta<typeof KpiCard> = {
  title: 'Dashboard/KpiCard',
  component: KpiCard,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof KpiCard>

export const Default: Story = {
  args: {
    title: 'Total Machines',
    value: 7,
    subtitle: '5 running',
    icon: <Factory className="h-5 w-5" />,
    variant: 'default',
  },
}

export const Warning: Story = {
  args: {
    title: 'Active Alarms',
    value: 3,
    subtitle: '1 critical',
    icon: <AlertTriangle className="h-5 w-5" />,
    variant: 'warning',
  },
}

export const Success: Story = {
  args: {
    title: 'Avg OEE',
    value: '82.4%',
    icon: <Activity className="h-5 w-5" />,
    variant: 'success',
  },
}

export const Danger: Story = {
  args: {
    title: 'Avg OEE',
    value: '54.2%',
    icon: <Activity className="h-5 w-5" />,
    variant: 'danger',
  },
}

export const WithTrend: Story = {
  args: {
    title: "Today's Production",
    value: '892',
    subtitle: 'of 1,200 target',
    icon: <Activity className="h-5 w-5" />,
    trend: 5.3,
    variant: 'default',
  },
}
