import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { hasPermission, type Permission } from '../../app/permissions';
import type { UserRole } from '../types/domain';
import { getJwtUser, isJwtExpired } from '../services/session.service';

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
  checkSession: () => void;
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

      checkSession: () => {
        const { token, username, role, hasSeenWelcome } = get();
        if (!token) {
          set({ sessionChecked: true, isAuthenticated: false, welcomePending: false, hasSeenWelcome: false });
          return;
        }

        if (isJwtExpired(token)) {
          set({
            token: null,
            username: null,
            role: null,
            isAuthenticated: false,
            sessionChecked: true,
            welcomePending: false,
            hasSeenWelcome: false,
            sessionMessage: 'auth.errors.sessionExpired',
          });
          return;
        }

        const jwtUser = getJwtUser(token);
        set({
          username: username ?? jwtUser.username ?? 'user',
          role: role ?? jwtUser.role ?? 'GUEST',
          isAuthenticated: true,
          sessionChecked: true,
          welcomePending: !hasSeenWelcome,
          sessionMessage: null,
        });
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
