/**
 * Role-aware link targets for the neutral participant routes (P2-D, D-FE-01
 * follow-up N1): TEACHER-only participants cannot use the STUDENT-gated
 * listing pages (`/sessions`, `/attempts`) — point them home instead.
 */
export function participantBackHref(roles: string[] | null | undefined): string {
  return roles?.includes("STUDENT") ? "/sessions" : "/";
}

export function participantHistoryHref(roles: string[] | null | undefined): string {
  return roles?.includes("STUDENT") ? "/attempts" : "/";
}
