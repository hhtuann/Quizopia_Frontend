import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Teacher route group layout. Every route under `(teacher)` is gated for
 * TEACHER (full access) or ACADEMIC_ADMIN (cross-school oversight — sessions,
 * reporting, exams read-only). Rendered inside the app shell. `(teacher)` is a
 * route group — it does NOT add a URL segment.
 *
 * Server component: it composes client components (`RequireAuth`, `AppShell`)
 * and passes `children` through. The client boundary is owned by those
 * components, not this layout.
 */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole={["TEACHER", "ACADEMIC_ADMIN"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
