import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatPercent(n: number, decimals = 1): string {
  return `${formatNumber(n, decimals)}%`
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400'
    case 'HIGH':
      return 'text-orange-600 bg-orange-50 dark:bg-orange-950 dark:text-orange-400'
    case 'MEDIUM':
      return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400'
    case 'LOW':
      return 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400'
    default:
      return 'text-gray-600 bg-gray-50 dark:bg-gray-900 dark:text-gray-400'
  }
}

export function healthColor(score: number): string {
  if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400'
  if (score >= 60) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400'
  return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400'
}

export function statusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
    case 'ĐANG CHẠY':
      return 'bg-green-500'
    case 'IDLE':
    case 'CHỜ':
      return 'bg-yellow-500'
    case 'DOWN':
    case 'DỪNG':
      return 'bg-red-500'
    default:
      return 'bg-gray-400'
  }
}
