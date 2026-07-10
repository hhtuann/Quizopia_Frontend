import { http } from "./http-client";
import type { PageResponse } from "./question-banks";

/**
 * Student onboarding API + types. Mirrors backend records in
 * `com.hhtuann.backend.academic.dto` (StudentOnboardingController).
 */

// ============================================================
// ONBOARD-1: pending students + assign school
// ============================================================

/** Backend record `PendingStudentItem` (GET /api/admin/pending-students). */
export interface PendingStudentItem {
  userId: number;
  username: string;
  email: string;
  displayName: string;
  registeredAt: string;
}

/** Body for `POST /api/admin/students/{userId}/assign-school`. */
export interface AssignSchoolRequest {
  schoolId: number;
}

/** Backend record `StudentProfileResponse` (assign-school result). */
export interface StudentProfileResponse {
  id: number;
  studentCode: string;
  schoolId: number;
  userId: number;
  username: string;
  displayName: string;
  enrollmentStatus: string;
}

export interface PendingStudentsParams {
  search?: string;
  page?: number;
  size?: number;
}

/** `GET /api/admin/pending-students` → PageResponse<PendingStudentItem>. */
export function listPendingStudents(
  params: PendingStudentsParams = {}
): Promise<PageResponse<PendingStudentItem>> {
  return http.get<PageResponse<PendingStudentItem>>("/api/admin/pending-students", { params });
}

/** `POST /api/admin/students/{userId}/assign-school` → 201 StudentProfileResponse. */
export function assignStudentToSchool(
  userId: number,
  schoolId: number
): Promise<StudentProfileResponse> {
  return http.post<StudentProfileResponse>(
    `/api/admin/students/${userId}/assign-school`,
    { schoolId }
  );
}

// ============================================================
// ONBOARD-2: student search
// ============================================================

/** Backend record `StudentSearchResult` (GET /api/students/search). */
export interface StudentSearchResult {
  studentProfileId: number;
  studentCode: string;
  displayName: string;
  username: string;
  email: string;
}

/** Backend record `StudentSearchResponse`. */
export interface StudentSearchResponse {
  items: StudentSearchResult[];
}

/** `GET /api/students/search?q=` → StudentSearchResponse. */
export function searchStudents(q: string): Promise<StudentSearchResponse> {
  return http.get<StudentSearchResponse>("/api/students/search", { params: { q } });
}
