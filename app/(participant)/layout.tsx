import type { ReactNode } from "react";
import { AuthenticatedShell } from "@/components/auth/AuthenticatedShell";

/**
 * Layout for the shared-session deep link `/sessions/{sessionId}` (P2-D,
 * issue #20): authenticated-only, NO role requirement — the backend
 * eligibility/start policy authorizes access (TEACHER-only accounts hold the
 * learner permissions since V16). The student-only listing at `/sessions`
 * keeps its own `(student)` group STUDENT guard untouched.
 */
export default function ParticipantLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
