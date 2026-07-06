import { http } from "./http-client";

/**
 * Exam-purposes API + types (school-scoped). Mirrors
 * com.hhtuann.backend.exam.dto.ExamPurposeResponse. The controller returns
 * `Map.of("items", list)` → shape `{ items: [...] }`.
 */

/** Backend record `ExamPurposeResponse(Long id, String code, String title, Integer position)`. */
export interface ExamPurposeResponse {
  id: number;
  code: string;
  title: string;
  position: number | null;
}

export interface ExamPurposeListResponse {
  items: ExamPurposeResponse[];
}

/** `GET /api/exam-purposes` — school-scoped list for the exam-create dropdown. */
export function listPurposes(): Promise<ExamPurposeListResponse> {
  return http.get<ExamPurposeListResponse>("/api/exam-purposes");
}
