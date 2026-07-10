"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionLabel } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

/**
 * CLIENT-SIDE route guard — UX only, NOT a security boundary. The backend
 * enforces authentication + authorization on every request (see
 * docs/QUIZOPIA_PROJECT_HANDOFF.md §13); this guard only avoids flashing
 * protected UI to unauthenticated / under-privileged users.
 *
 * - `loading`         → DESIGN_NEXT loader (same on SSR + first paint → no hydration mismatch).
 * - `unauthenticated` → redirect to /login in an effect; render the loader meanwhile.
 * - `authenticated`   → render children, unless `requireRole` is set and the user
 *                       lacks every required role, in which case redirect to "/" (and
 *                       show a brief 403 card).
 */
export function RequireAuth({
  children,
  requireRole,
}: {
  children: ReactNode;
  requireRole?: string | string[];
}) {
  const router = useRouter();
  const { status, user } = useAuth();

  const requiredRoles = requireRole
    ? Array.isArray(requireRole)
      ? requireRole
      : [requireRole]
    : [];
  const hasRequiredRole =
    requiredRoles.length === 0 ||
    requiredRoles.some((role) => user?.roles?.includes(role));
  const forbidden = status === "authenticated" && !hasRequiredRole;

  useEffect(() => {
    // Redirects happen in the effect (post-mount) so the first paint stays
    // consistent with SSR (always the loader while loading/unauthenticated).
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (forbidden) {
      router.replace("/");
    }
  }, [status, forbidden, router]);

  if (status === "loading" || status === "unauthenticated") {
    return <AuthLoader />;
  }

  if (forbidden) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
        <Card variant="elevated" className="max-w-md p-8 text-center">
          <SectionLabel className="mb-4">
            Restricted
          </SectionLabel>
          <h1 className="font-display text-2xl tracking-tight text-[#0F172A]">
            Access denied
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            You don&apos;t have permission to view this page.
          </p>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}

/** DESIGN_NEXT loading indicator — accent ring spinner (shared with RedirectIfAuthenticated). */
export function AuthLoader() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading…"
      className="flex min-h-screen items-center justify-center bg-[#FAFAFA]"
    >
      {/* Spinning ring with an accent top arc — minimalist, no soft-UI insets. */}
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0052FF]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
