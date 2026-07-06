"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { NormalizedApiError } from "@/lib/api";

/**
 * TanStack Query provider with a stable client.
 *
 * - The `QueryClient` is created once via the `useState` initializer (runs once
 *   per browser session, not per render) — never instantiate it in render body.
 * - `retry`: FE3 owns 401 handling (single-flight refresh + one retry at the
 *   axios layer), so react-query must NOT compound it. API/HTTP responses are
 *   never retried here; a transient network drop is retried once.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              const norm = error as unknown as NormalizedApiError | undefined;
              if (norm?.kind === "network") return failureCount < 1;
              // 'api' / 'http' / 'unknown' — don't auto-retry server errors.
              return false;
            },
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Mutations (login/register/...) opt into their own retry; default off.
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
