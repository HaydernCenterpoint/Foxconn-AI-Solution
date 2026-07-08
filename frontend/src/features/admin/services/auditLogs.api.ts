import { api } from '../../../shared/services/apiClient';
import { normalizeAuditLogList } from '../../../shared/services/normalize';

export interface AuditLog {
  id: number;
  username: string;
  action: string;
  details?: string;
  createdAt: string;
}

export const auditLogsApi = {
  getAll: (limit = 200) =>
    api.get('/audit-logs', { params: { limit } }).then((r) => normalizeAuditLogList(r.data)),
};
