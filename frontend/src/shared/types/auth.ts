export type UserRole = 'ADMIN' | 'ENGINEER' | 'GUEST';

export interface User {
  id?: string;
  username: string;
  displayName?: string;
  role: UserRole;
}

export interface AuthState {
  token: string | null;
  username: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  login: (token: string, username: string, role: UserRole) => void;
  logout: () => void;
}
