import { api } from '../../../shared/services/apiClient';
import { normalizeLoginResponse } from '../../../shared/services/normalize';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  role: 'ADMIN' | 'ENGINEER' | 'GUEST';
}

export interface SessionResponse {
  username: string;
  role: 'ADMIN' | 'ENGINEER' | 'GUEST';
  expiresAt: number;
}

export const authApi = {
  login: (data: LoginRequest) =>
    api.post('/auth/login', data).then((r) => normalizeLoginResponse(r.data)),
  getSession: () => api.get<SessionResponse>('/auth/session').then((r) => r.data),
  logout: () => api.post('/auth/logout').then(() => undefined),
};
