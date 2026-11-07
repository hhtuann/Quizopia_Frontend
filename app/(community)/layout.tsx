import type { ReactNode } from "react";
import { AuthenticatedShell } from "@/components/auth/AuthenticatedShell";

/**
 * Authenticated Community console layout (P3-A-FE2, issue #44; extended by
 * #46).
 *
 * Deliberately its own route group serving `/community/moderation` and
 * `/community/bookmarks`: moderators are ANY ACTIVE user holding the dormant
 * `COMMUNITY_MODERATOR` role (ADR-006 §5 — STUDENT, TEACHER or dual-role),
 * and the saved collection is ONE shared collection for STUDENT+TEACHER
 * (§7) — so neither page may sit in the `(teacher)`/`(student)` groups (they
 * hard-gate roles) nor under `app/community/` (that layout renders the
 * anonymous `PublicHeader`). Role-free `RequireAuth` + `AppShell` here keeps
 * the authenticated nav consistent; the moderation page gates itself on
 * `GET /api/community/moderation/grant`.
 */
export default function CommunityConsoleLayout({ children }: { children: ReactNode }) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
