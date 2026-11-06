"use client";

import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import AppShell from "@/components/layout/AppShell";

/**
 * Neutral authenticated shell for the shared-session deep link (P2-D,
 * issue #20, TL finding D-FE-01): ANY authenticated user may reach the
 * participant landing — the backend eligibility/start policy is the single
 * authorizer (Phase 1 V16 grants TEACHER-only accounts the learner
 * permissions). Unlike the `(student)` group layout this adds NO role
 * requirement; unrelated student-only pages keep their STUDENT guard.
 */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
