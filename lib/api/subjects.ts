import { http } from "./http-client";

/**
 * Subjects API + types (school-scoped, SUBJECT_READ / SUBJECT_CREATE /
 * SUBJECT_UPDATE / SUBJECT_STATUS_UPDATE). Mirrors the backend records
 * (SubjectView / SubjectListResponse / SubjectResponse / Create- /
 * UpdateSubjectRequest / UpdateSubjectStatusRequest / GradeLevelView /
 * GradeLevelListResponse).
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
  schoolId?: number;
}

/** Persisted status shared by school-scoped academic entities. */
export type AcademicStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

/** Rich subject payload from the mutating endpoints (POST/PUT/PUT-status). */
export interface SubjectResponse {
  id: number;
  schoolId: number;
  gradeLevelId: number;
  code: string;
  name: string;
  description: string | null;
  status: AcademicStatus;
  createdAt: string;
}

/** Body for `POST /api/subjects`. */
export interface CreateSubjectRequest {
  code: string;
  name: string;
  description: string | null;
  schoolId: number;
  gradeLevelId: number;
}

/** Body for `PUT /api/subjects/{id}` (mutable non-status fields only). */
export interface UpdateSubjectRequest {
  name: string;
  description: string | null;
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

/** `GET /api/subjects` — school-scoped subject list for the caller. */
export function listSubjects(
  params: SubjectListParams = {}
): Promise<SubjectListResponse> {
  return http.get<SubjectListResponse>("/api/subjects", { params });
}

/** `POST /api/subjects` → 201 SubjectResponse (SUBJECT_CREATE). */
export function createSubject(
  req: CreateSubjectRequest
): Promise<SubjectResponse> {
  return http.post<SubjectResponse>("/api/subjects", req);
}

/** `PUT /api/subjects/{id}` → SubjectResponse (SUBJECT_UPDATE). */
export function updateSubject(
  id: number,
  req: UpdateSubjectRequest
): Promise<SubjectResponse> {
  return http.put<SubjectResponse>(`/api/subjects/${id}`, req);
}

/** `PUT /api/subjects/{id}/status` → SubjectResponse (SUBJECT_STATUS_UPDATE). */
export function updateSubjectStatus(
  id: number,
  status: AcademicStatus
): Promise<SubjectResponse> {
  return http.put<SubjectResponse>(`/api/subjects/${id}/status`, { status });
}

/** `GET /api/grade-levels?schoolId=` — school-scoped grade levels (GRADE_LEVEL_READ). */
export function getGradeLevels(
  schoolId?: number
): Promise<GradeLevelListResponse> {
  return http.get<GradeLevelListResponse>("/api/grade-levels", {
    params: { schoolId },
  });
}
