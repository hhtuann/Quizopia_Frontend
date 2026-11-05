/**
 * Post-login redirect continuation (P2-D, issue #20): a participant opening a
 * shared deep link while unauthenticated must land on /login and come back to
 * the intended session afterwards.
 *
 * Safety: only same-app PATHS are honored — a value is accepted when it
 * starts with a single "/" and is not protocol-relative ("//host", "/\\host"),
 * so an attacker-crafted `?returnTo=//evil.example` cannot redirect to an
 * external origin after login. Query strings are preserved.
 */

/** Returns a safe internal path for the given raw returnTo value, or null. */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  if (!raw.startsWith("/")) {
    return null;
  }
  // Reject protocol-relative and backslash tricks ("//host", "/\\host").
  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return null;
  }
  return raw;
}

/** Builds `/login?returnTo=<encoded path+search>` for the current location. */
export function buildLoginRedirect(pathname: string, search: string): string {
  const target = `${pathname}${search}`;
  return `/login?returnTo=${encodeURIComponent(target)}`;
}
