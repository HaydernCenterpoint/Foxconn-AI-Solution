import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/services/apiClient', () => ({
  api: { get: apiGet },
}));

import { systemApi } from './system.api';

describe('system connector API', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('normalizes connector status and drops malformed rows', async () => {
    apiGet.mockResolvedValue({
      data: [
        {
          name: 'erp',
          status: 'success',
          last_sync_at: '2026-07-28T10:00:00Z',
          last_successful_sync: '2026-07-28T10:00:00Z',
          records_synced: 12,
          errors: 0,
          error_message: null,
          running: true,
        },
        { name: '', status: 'unknown' },
      ],
    });

    await expect(systemApi.getConnectors()).resolves.toEqual([{
      name: 'erp',
      status: 'success',
      lastSyncAt: '2026-07-28T10:00:00Z',
      lastSuccessfulSync: '2026-07-28T10:00:00Z',
      recordsSynced: 12,
      errors: 0,
      errorMessage: null,
      running: true,
    }]);
    expect(apiGet).toHaveBeenCalledWith('/integrations/connectors');
  });
});
