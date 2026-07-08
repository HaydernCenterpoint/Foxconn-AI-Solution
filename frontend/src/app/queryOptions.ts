export const queryTimings = {
  dashboard: 5_000,
  lines: 4_000,
  machines: 5_000,
  alarmsActive: 5_000,
  alarmsPassive: 30_000,
  reports: 10_000,
  machineConfig: 8_000,
  appShellSummary: 10_000,
} as const;

export const queryBehavior = {
  staleTime: 15_000,
  gcTime: 5 * 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
} as const;
