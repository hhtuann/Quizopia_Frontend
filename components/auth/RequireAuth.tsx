"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

/**
 * CLIENT-SIDE route guard — UX only, NOT a security boundary. The backend
 * enforces authentication + authorization on every request (see
 * docs/QUIZOPIA_PROJECT_HANDOFF.md §13); this guard only avoids flashing
 * protected UI to unauthenticated / under-privileged users.
 *
 * - `loading`         → neumorphic loader (same on SSR + first paint → no hydration mismatch).
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
      <main className="flex min-h-screen items-center justify-center bg-[#E0E5EC] px-4">
        <div className="max-w-md rounded-container bg-[#E0E5EC] p-8 text-center shadow-extruded">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#3D4852]">
            Access denied
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            You don&apos;t have permission to view this page.
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

/** Neumorphic loading indicator (shared with RedirectIfAuthenticated). */
export function AuthLoader() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading…"
      className="flex min-h-screen items-center justify-center bg-[#E0E5EC]"
    >
      {/* Inset well + orbiting accent dot = a neumorphic spinner. */}
      <div className="relative h-10 w-10 animate-spin rounded-full bg-[#E0E5EC] shadow-inset-deep">
        <span className="absolute left-1/2 top-1 h-2 w-2 -translate-x-1/2 rounded-full bg-[#6C63FF] shadow-extruded-small" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
