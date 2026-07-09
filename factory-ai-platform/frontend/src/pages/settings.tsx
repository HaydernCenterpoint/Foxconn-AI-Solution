import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/lib/store'
import { Moon, Sun, Server, Database, Globe, Shield } from 'lucide-react'

export function SettingsPage() {
  const { darkMode, toggleDarkMode } = useAppStore()
  const [apiBase, setApiBase] = useState(import.meta.env.VITE_API_BASE ?? 'http://localhost:5000')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    localStorage.setItem('mkz_api_base', apiBase)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure application preferences
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Appearance
          </CardTitle>
          <CardDescription>Customize the look and feel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">Toggle dark theme</p>
            </div>
            <Button
              variant={darkMode ? 'default' : 'outline'}
              onClick={toggleDarkMode}
            >
              {darkMode ? (
                <>
                  <Moon className="mr-2 h-4 w-4" />
                  Dark
                </>
              ) : (
                <>
                  <Sun className="mr-2 h-4 w-4" />
                  Light
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            API Configuration
          </CardTitle>
          <CardDescription>Connect to the backend API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Backend Base URL</label>
            <Input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="http://localhost:5000"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave}>
              {saved ? 'Saved!' : 'Save'}
            </Button>
            <Badge variant="secondary">Mock mode active</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data
          </CardTitle>
          <CardDescription>Data source and refresh settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Data Source</p>
              <p className="text-sm text-muted-foreground">Currently using mock data</p>
            </div>
            <Badge>Mock</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Refresh Interval</p>
              <p className="text-sm text-muted-foreground">Live data polling interval</p>
            </div>
            <Badge>30s</Badge>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong>MKZ Factory Monitor UI</strong></p>
          <p>Version: 0.1.0</p>
          <p>Stack: React 19 + TypeScript + Tailwind CSS + Recharts</p>
          <p>Built for MKZ Manufacturing Operations</p>
        </CardContent>
      </Card>
    </div>
  )
}
