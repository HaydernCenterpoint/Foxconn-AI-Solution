import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warn';
  message: string;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: string;
  read: boolean;
}

interface UiState {
  sidebarCollapsed: boolean;
  tableDensity: 'compact' | 'comfortable';
  theme: 'dark' | 'light';
  refreshIntervalSeconds: number;
  defaultDashboardRange: 'hour' | 'shift' | 'day' | 'week' | 'month';
  defaultPageSize: number;
  reducedMotion: boolean;
  toasts: Toast[];
  notifications: Notification[];
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setTableDensity: (value: UiState['tableDensity']) => void;
  setTheme: (value: UiState['theme']) => void;
  setRefreshIntervalSeconds: (value: number) => void;
  setDefaultDashboardRange: (value: UiState['defaultDashboardRange']) => void;
  setDefaultPageSize: (value: number) => void;
  setReducedMotion: (value: boolean) => void;
  addToast: (type: Toast['type'], message: string) => void;
  removeToast: (id: string) => void;
  addNotification: (type: Notification['type'], message: string) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      tableDensity: 'comfortable',
      theme: 'dark',
      refreshIntervalSeconds: 5,
      defaultDashboardRange: 'hour',
      defaultPageSize: 10,
      reducedMotion: false,
      toasts: [],
      notifications: [],

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setTableDensity: (value) => set({ tableDensity: value }),
      setTheme: (value) => {
        set({ theme: value });
        if (typeof document !== 'undefined') {
          document.documentElement.dataset.theme = value;
        }
      },
      setRefreshIntervalSeconds: (value) => set({ refreshIntervalSeconds: value }),
      setDefaultDashboardRange: (value) => set({ defaultDashboardRange: value }),
      setDefaultPageSize: (value) => set({ defaultPageSize: value }),
      setReducedMotion: (value) => set({ reducedMotion: value }),

      addToast: (type, message) => {
        const id = crypto.randomUUID();
        set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, 3500);
      },

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      addNotification: (type, message) => {
        const id = crypto.randomUUID();
        const timestamp = new Date().toLocaleString();
        set((s) => ({ 
          notifications: [{ id, type, message, timestamp, read: false }, ...s.notifications].slice(0, 50) 
        }));
      },

      markNotificationRead: (id) =>
        set((s) => ({ 
          notifications: s.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
          ) 
        })),

      clearNotifications: () =>
        set((s) => ({ 
          notifications: s.notifications.map(n => ({ ...n, read: true })) 
        })),
    }),
    {
      name: 'fii-ui-settings',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        tableDensity: state.tableDensity,
        theme: state.theme,
        refreshIntervalSeconds: state.refreshIntervalSeconds,
        defaultDashboardRange: state.defaultDashboardRange,
        defaultPageSize: state.defaultPageSize,
        reducedMotion: state.reducedMotion,
      }),
    },
  ),
);
