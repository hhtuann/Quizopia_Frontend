import { http } from "./http-client";

/**
 * Subjects API + types (school-scoped, SUBJECT_READ). Mirrors the backend
 * records (com.hhtuann.backend.academic.dto.SubjectView / SubjectListResponse).
 * The endpoint returns only ACTIVE subjects in the caller's school.
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

/** `GET /api/subjects` — school-scoped subject list for the caller (TEACHER). */
export function listSubjects(
  params: SubjectListParams = {}
): Promise<SubjectListResponse> {
  return http.get<SubjectListResponse>("/api/subjects", { params });
}
