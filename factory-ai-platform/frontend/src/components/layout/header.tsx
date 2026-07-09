import { useState } from 'react'
import { Bell, Moon, Sun, RefreshCw, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getActiveAlarms } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

export function Header() {
  const { darkMode, toggleDarkMode } = useAppStore()
  const [search, setSearch] = useState('')

  const { data: alarms = [] } = useQuery({
    queryKey: ['active-alarms'],
    queryFn: getActiveAlarms,
    refetchInterval: 30000,
  })

  const criticalCount = alarms.filter((a) => a.severity === 'CRITICAL').length

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
      {/* Search */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search machines, alarms..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Refresh */}
        <Button variant="ghost" size="icon" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>

        {/* Dark mode */}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} title="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative" title="Alarms">
          <Bell className="h-4 w-4" />
          {alarms.length > 0 && (
            <span
              className={cn(
                'absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                criticalCount > 0
                  ? 'bg-red-500 text-white'
                  : 'bg-yellow-500 text-white',
              )}
            >
              {alarms.length > 9 ? '9+' : alarms.length}
            </span>
          )}
        </Button>
      </div>
    </header>
  )
}
