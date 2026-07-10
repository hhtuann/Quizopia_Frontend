"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AuthLoader } from "./RequireAuth";

/**
 * CLIENT-SIDE guard for guest-only pages (/login, /register) — UX only, NOT a
 * security boundary. Sends already-authenticated users to `to` (default "/").
 *
 * - `loading`         → loading spinner (no redirect → no flicker; same SSR + first paint).
 * - `authenticated`   → redirect to `to` in an effect; render nothing meanwhile.
 * - `unauthenticated` → render children (the guest form).
 */
export function RedirectIfAuthenticated({
  children,
  to = "/",
}: {
  children: ReactNode;
  to?: string;
}) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    // Post-mount redirect keeps the first paint consistent with SSR.
    if (status === "authenticated") {
      router.replace(to);
    }
  }, [status, to, router]);

  if (status === "loading") {
    return <AuthLoader />;
  }
  if (status === "authenticated") {
    return null;
  }
  return <>{children}</>;
}
