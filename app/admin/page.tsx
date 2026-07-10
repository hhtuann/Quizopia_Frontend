import { redirect } from "next/navigation";

/**
 * The dedicated `/admin` dashboard was redundant with the role-aware home
 * dashboard at `/` (which already renders each role's action cards), so the
 * nav item and dashboard page were removed. This route now redirects to `/`
 * so any stale link or bookmark lands on the real dashboard instead of a 404.
 *
 * The `admin` segment layout (role gate [ACADEMIC_ADMIN, SYSTEM_ADMIN] +
 * AppShell) still wraps the child routes `/admin/subjects`,
 * `/admin/users`, and `/admin/pending-students`.
 */
export default function AdminRedirectPage() {
  redirect("/");
}
