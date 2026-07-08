import { QueryClient } from '@tanstack/react-query';
import { queryBehavior } from './queryOptions';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: queryBehavior.staleTime,
      gcTime: queryBehavior.gcTime,
      retry: queryBehavior.retry,
      refetchOnWindowFocus: queryBehavior.refetchOnWindowFocus,
      refetchOnReconnect: queryBehavior.refetchOnReconnect,
    },
    mutations: {
      retry: 0,
    },
  },
});
