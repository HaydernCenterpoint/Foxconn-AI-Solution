import type { Meta } from '@storybook/react'

const meta: Meta = {
  title: 'Components/Badge',
  tags: ['autodocs'],
}

export default meta

export const SeverityBadges = {
  render: () => (
    <div className="flex gap-2 flex-wrap p-4">
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80">
        DEFAULT
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
        CRITICAL
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400">
        HIGH
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
        MEDIUM
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
        LOW
      </span>
    </div>
  ),
}

export const HealthBadges = {
  render: () => (
    <div className="flex gap-2 flex-wrap p-4">
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
        Healthy 85%
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400">
        Warning 65%
      </span>
      <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
        Critical 42%
      </span>
    </div>
  ),
}
