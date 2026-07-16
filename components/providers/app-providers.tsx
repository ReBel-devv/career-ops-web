"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Client-side app providers: TanStack Query (server state for applications +
 * states) and a lightweight config context so client components can hide write
 * affordances under READ_ONLY without an extra round-trip (the server layout
 * reads `getConfig()` and passes the flags down).
 */

export interface ClientConfig {
  readOnly: boolean;
  demoMode: boolean;
  /** The embedded assistant is available (local, real repo, not disabled). */
  assistantEnabled: boolean;
  /** The assistant may perform mutations (false under READ_ONLY). */
  assistantWritable: boolean;
}

const ConfigContext = createContext<ClientConfig>({
  readOnly: false,
  demoMode: false,
  assistantEnabled: false,
  assistantWritable: false,
});

export function useClientConfig(): ClientConfig {
  return useContext(ConfigContext);
}

/** True when mutations are disabled (READ_ONLY, but never in demo mode). */
export function useMutationsEnabled(): boolean {
  const { readOnly, demoMode } = useClientConfig();
  return !readOnly || demoMode;
}

export function AppProviders({
  config,
  children,
}: {
  config: ClientConfig;
  children: ReactNode;
}) {
  // One QueryClient per browser session. Living data → short stale time; the
  // tracker is read at request time server-side, so a brief cache is plenty.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ConfigContext.Provider value={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigContext.Provider>
  );
}
