import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hasPermission, type Permission } from '../../app/permissions';
import type { UserRole } from '../types/domain';
import { getJwtUser, isJwtExpired } from '../services/session.service';
import { authApi } from '../../features/auth/services/auth.api';

const DEMO_MODE = import.meta.env.MODE === 'demo';

interface AuthState {
  token: string | null;
  username: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  sessionChecked: boolean;
  welcomePending: boolean;
  hasSeenWelcome: boolean;
  sessionMessage: string | null;
  login: (token: string, username: string, role: UserRole) => void;
  logout: (message?: string) => void;
  checkSession: () => Promise<void>;
  consumeWelcome: () => void;
  can: (permission: Permission) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      sessionChecked: false,
      welcomePending: false,
      hasSeenWelcome: false,
      sessionMessage: null,

      login: (token, username, role) =>
        set({
          token,
          username,
          role,
          isAuthenticated: true,
          sessionChecked: true,
          welcomePending: true,
          hasSeenWelcome: false,
          sessionMessage: null,
        }),

      logout: (message) =>
        set({
          token: null,
          username: null,
          role: null,
          isAuthenticated: false,
          sessionChecked: true,
          welcomePending: false,
          hasSeenWelcome: false,
          sessionMessage: message ?? null,
        }),

      checkSession: async () => {
        const { token, username, role, hasSeenWelcome } = get();
        if (DEMO_MODE) {
          set({
            token: null,
            username: 'Demo Viewer',
            role: 'GUEST',
            isAuthenticated: true,
            sessionChecked: true,
            welcomePending: false,
            hasSeenWelcome: true,
            sessionMessage: null,
          });
          return;
        }

        if (token && !isJwtExpired(token)) {
          const jwtUser = getJwtUser(token);
          set({
            username: username ?? jwtUser.username ?? 'user',
            role: role ?? jwtUser.role ?? 'GUEST',
            isAuthenticated: true,
            sessionChecked: true,
            welcomePending: !hasSeenWelcome,
            sessionMessage: null,
          });
          return;
        }

        try {
          const session = await authApi.getSession();
          set({
            token: null,
            username: session.username,
            role: session.role,
            isAuthenticated: true,
            sessionChecked: true,
            welcomePending: !hasSeenWelcome,
            sessionMessage: null,
          });
        } catch {
          set({
            token: null,
            username: null,
            role: null,
            isAuthenticated: false,
            sessionChecked: true,
            welcomePending: false,
            hasSeenWelcome: false,
            sessionMessage: token ? 'auth.errors.sessionExpired' : null,
          });
        }
      },

      consumeWelcome: () => set({ welcomePending: false, hasSeenWelcome: true }),

      can: (permission) => {
        const { role } = get();
        return hasPermission(role, permission);
      },
    }),
    {
      name: 'mkz-auth',
      partialize: (state) => ({
        token: state.token,
        username: state.username,
        role: state.role,
        isAuthenticated: state.isAuthenticated,
        hasSeenWelcome: state.hasSeenWelcome,
      }),
    }
  )
);
