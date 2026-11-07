import { http } from "./http-client";

/**
 * Subjects API + types. Subjects are a global seeded catalog —
 * read endpoints are open to authenticated users; the catalog is seed-managed
 * (no client-side CRUD). Mirrors the backend records (SubjectView /
 * SubjectListResponse / GradeLevelView / GradeLevelListResponse).
 */

/** Backend record `SubjectView(Long id, String code, String name, Long gradeLevelId)`. */
export interface SubjectView {
  id: number;
  code: string;
  name: string;
  gradeLevelId: number;
}

/** Backend record `SubjectListResponse(List<SubjectView> items)`. */
export interface SubjectListResponse {
  items: SubjectView[];
}

export interface SubjectListParams {
  search?: string;
  gradeLevelId?: number;
}

/** Backend record `GradeLevelView(Long id, String code, String name, Integer sortOrder)`. */
export interface GradeLevelView {
  id: number;
  code: string;
  name: string;
  sortOrder: number | null;
}

/** Backend record `GradeLevelListResponse(List<GradeLevelView> items)`. */
export interface GradeLevelListResponse {
  items: GradeLevelView[];
}

/** `GET /api/subjects` — global subject catalog for the caller. */
export function listSubjects(
  params: SubjectListParams = {}
): Promise<SubjectListResponse> {
  return http.get<SubjectListResponse>("/api/subjects", { params });
}

/** `GET /api/grade-levels` — global grade-level catalog. */
export function getGradeLevels(): Promise<GradeLevelListResponse> {
  return http.get<GradeLevelListResponse>("/api/grade-levels");
}
