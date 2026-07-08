import { api } from '../../../shared/services/apiClient';
import { normalizeActionResult, normalizeUserList } from '../../../shared/services/normalize';

export interface User {
  id: number;
  username: string;
  role: 'ADMIN' | 'ENGINEER' | 'GUEST';
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: 'ADMIN' | 'ENGINEER' | 'GUEST';
}

export const usersApi = {
  getAll: () => api.get('/users').then((r) => normalizeUserList(r.data)),

  create: (data: CreateUserRequest) =>
    api.post('/users', data).then((r) => normalizeActionResult(r.data)),

  delete: (id: number) =>
    api.delete(`/users/${id}`).then((r) => normalizeActionResult(r.data)),
};
