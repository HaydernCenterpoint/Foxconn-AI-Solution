import { create } from 'zustand'
import type { Alarm } from './contracts'

interface AppState {
  selectedAssetId: string | null
  selectedLineCode: string | null
  activeAlarms: Alarm[]
  sidebarCollapsed: boolean
  darkMode: boolean

  setSelectedAsset: (id: string | null) => void
  setSelectedLine: (code: string | null) => void
  setActiveAlarms: (alarms: Alarm[]) => void
  toggleSidebar: () => void
  toggleDarkMode: () => void
}

export const useAppStore = create<AppState>((set) => ({
  selectedAssetId: null,
  selectedLineCode: null,
  activeAlarms: [],
  sidebarCollapsed: false,
  darkMode: false,

  setSelectedAsset: (id) => set({ selectedAssetId: id }),
  setSelectedLine: (code) => set({ selectedLineCode: code }),
  setActiveAlarms: (alarms) => set({ activeAlarms: alarms }),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.darkMode
      if (next) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      return { darkMode: next }
    }),
}))
