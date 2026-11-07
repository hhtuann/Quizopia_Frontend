import { http } from "./http-client";

/**
 * Student search API + types (classroom "add students by search"). The search
 * is user-based: it matches STUDENT-role users by display name. Mirrors the
 * backend records in the students search controller.
 */

/** Backend record `StudentSearchResult` (GET /api/students/search). User-based; `studentCode` is always null now (kept for shape compatibility). */
export interface StudentSearchResult {
  userId: number;
  studentCode: string | null;
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
