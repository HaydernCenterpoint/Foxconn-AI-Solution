import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

export type RefreshScope = 'all' | 'monitoring' | 'admin';

export async function invalidateRefreshScope(queryClient: QueryClient, scope: RefreshScope) {
  if (scope === 'all') {
    await queryClient.invalidateQueries();
    return;
  }

  if (scope === 'monitoring') {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['lines'] }),
      queryClient.invalidateQueries({ queryKey: ['machines'] }),
      queryClient.invalidateQueries({ queryKey: ['alarms'] }),
    ]);
    return;
  }

  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.users() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.auditLogs() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.admin.machinesAll() }),
    queryClient.invalidateQueries({ queryKey: ['lines'] }),
  ]);
}
