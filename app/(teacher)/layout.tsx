import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Teacher route group layout. Every route under `(teacher)` is TEACHER-gated
 * and rendered inside the app shell. `(teacher)` is a route group — it does
 * NOT add a URL segment (its pages live at `/question-banks`, etc.).
 *
 * Server component: it composes client components (`RequireAuth`, `AppShell`)
 * and passes `children` through. The client boundary is owned by those
 * components, not this layout.
 */
export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole="TEACHER">
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
