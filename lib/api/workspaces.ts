import { http } from "./http-client";

/**
 * Workspaces API + types (Phase 1, Task A). Mirrors backend records:
 *   - com.quizopia.backend.workspace.dto.WorkspaceSummary
 *   - com.quizopia.backend.workspace.dto.MyWorkspacesResponse
 *
 * Endpoint (WorkspaceController):
 *   - GET /api/workspaces/my → MyWorkspacesResponse
 */

export type WorkspaceType = "PERSONAL" | "ORGANIZATION";

/** Backend record `WorkspaceSummary` — the caller's own membership view only. */
export interface WorkspaceSummary {
  workspaceId: number;
  workspaceType: WorkspaceType;
  name: string;
  organizationId: number | null;
  role: string;
  status: string;
  memberSince: string | null;
}

/** Backend record `MyWorkspacesResponse`. */
export interface MyWorkspacesResponse {
  workspaces: WorkspaceSummary[];
  personalWorkspaceId: number | null;
}

/** `GET /api/workspaces/my` — workspaces the caller may activate. */
export function fetchMyWorkspaces(): Promise<MyWorkspacesResponse> {
  return http.get<MyWorkspacesResponse>("/api/workspaces/my");
}
