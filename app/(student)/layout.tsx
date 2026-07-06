import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

/**
 * Student route group layout. Every route under `(student)` is STUDENT-gated
 * and rendered inside the app shell. `(student)` is a route group — it does
 * NOT add a URL segment (its pages live at `/sessions`, `/history`).
 *
 * Server component composing client components (`RequireAuth`, `AppShell`).
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth requireRole="STUDENT">
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
