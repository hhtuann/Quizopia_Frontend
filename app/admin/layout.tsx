import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Admin route SEGMENT layout. Unlike `(teacher)` (a route group, no URL
 * segment), `admin` is a real segment → every route here lives under `/admin/*`.
 *
 * Both admin roles may enter; individual pages apply finer page-level guards
 * (e.g. `/admin/subjects` → ACADEMIC_ADMIN, `/admin/users` → SYSTEM_ADMIN).
 *
 * Server component: composes client components (`RequireAuth`, `AppShell`) and
 * passes `children` through. The client boundary is owned by those components.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole={["ACADEMIC_ADMIN", "SYSTEM_ADMIN"]}>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
