import { http } from "./http-client";
import type { PageResponse, QuestionType } from "./question-banks";

/**
 * Exams API + types (Phase 1, Task B — one exam = one content set).
 * Mirrors backend records:
 *   - com.quizopia.backend.exam.dto.ExamListItem
 *   - com.quizopia.backend.exam.dto.TeacherExamEditorResponse
 *   - com.quizopia.backend.exam.dto.CreateExamRequest
 *   - com.quizopia.backend.exam.dto.UpdateDraftCompositionRequest
 *   - com.quizopia.backend.exam.dto.PublishExamRequest
 *   - com.quizopia.backend.exam.dto.PublishedExamSummary
 *
 * Endpoints (ExamController, prefix /api/exams):
 *   - GET    /api/exams/my                      → PageResponse<ExamListItem>
 *   - POST   /api/exams                         → 201 ExamListItem
 *   - GET    /api/exams/{examId}                → TeacherExamEditorResponse
 *   - PUT    /api/exams/{examId}/composition    → TeacherExamEditorResponse (DRAFT only)
 *   - POST   /api/exams/{examId}/publish        → PublishedExamSummary
 *   - POST   /api/exams/{examId}/duplicate      → 201 ExamListItem (new DRAFT copy)
 *   - POST   /api/exams/{examId}/archive        → TeacherExamEditorResponse
 *
 * There are NO exam versions anymore: publish is one-way and immutable; to
 * change content after publishing, DUPLICATE the exam and edit the copy.
 */

/** Embedded subject — same shape as `SubjectSummary`; null for personal-workspace exams. */
export interface ExamSubjectRef {
  id: number;
  code: string;
  name: string;
}

/** Backend `ExamPurposeSummary(Long id, String code, String title)`; null when the exam has none. */
export interface ExamPurposeRef {
  id: number;
  code: string;
  title: string;
}

export type ExamStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** Backend record `ExamListItem` (no version fields — one exam, one content set). */
export interface ExamListItem {
  id: number;
  code: string;
  title: string;
  subject: ExamSubjectRef | null;
  purpose: ExamPurposeRef | null;
  status: ExamStatus;
  questionCount: number;
  totalPoints: number;
  publishedAt: string | null;
  createdAt: string;
}

export interface ExamListParams {
  page?: number;
  size?: number;
  sort?: string;
  search?: string;
  subjectId?: number;
  status?: ExamStatus;
}

/**
 * Backend record `CreateExamRequest`. `workspaceId` is optional — defaults to
 * the caller's organization workspace when they hold a teacher profile, else
 * their personal workspace. `subjectId` is required for ORGANIZATION
 * workspaces and unsupported for PERSONAL ones.
 */
export interface CreateExamRequest {
  workspaceId?: number;
  subjectId?: number | null;
  purposeId?: number | null;
  title: string;
  description?: string | null;
}

/** `GET /api/exams/my` — list exams owned by the caller (TEACHER). */
export function listMyExams(
  params: ExamListParams = {}
): Promise<PageResponse<ExamListItem>> {
  return http.get<PageResponse<ExamListItem>>("/api/exams/my", { params });
}

/** `POST /api/exams` → 201 `ExamListItem`. */
export function createExam(req: CreateExamRequest): Promise<ExamListItem> {
  return http.post<ExamListItem>("/api/exams", req);
}

// ============================================================
// Editor (GET detail + PUT composition)
// ============================================================

/** Backend `ExamQuestionOptionResponse(Long id, String optionKey, String content, Boolean isCorrect, Integer position)`. */
export interface ExamQuestionOptionResponse {
  id: number;
  optionKey: string;
  content: string;
  isCorrect: boolean | null;
  position: number | null;
}

/**
 * Backend `ExamQuestionResponse`. `answerKey` and `metadata` are Jackson
 * `JsonNode` → opaque `unknown` (not deeply parsed). Carries the pinned
 * snapshot (content/options/answerKey) — TEACHER-ONLY; never reused for students.
 */
export interface ExamQuestionResponse {
  id: number;
  position: number | null;
  sourceQuestionId: number;
  sourceQuestionVersionId: number;
  questionCode: string;
  questionType: QuestionType;
  content: string;
  defaultPoints: number;
  difficulty: string | null;
  explanation: string | null;
  answerKey: unknown;
  metadata: unknown;
  sectionId: number;
  options: ExamQuestionOptionResponse[];
}

/** Backend `ExamSectionResponse(Long id, Integer position, String title, String instructions, List<ExamQuestionResponse> questions)`. */
export interface ExamSectionResponse {
  id: number;
  position: number | null;
  title: string;
  instructions: string | null;
  questions: ExamQuestionResponse[];
}

/**
 * Backend `TeacherExamEditorResponse` — the single management view of an exam
 * (Task B redesign): identity + settings + composition + publish metadata.
 * For PUBLISHED exams the composition is the immutable published snapshot.
 * `examVersion` is the JPA `@Version` optimistic token (starts 0, +1 after
 * each composition save).
 */
export interface TeacherExamEditorResponse {
  id: number;
  code: string;
  title: string;
  description: string | null;
  subject: ExamSubjectRef | null;
  purpose: ExamPurposeRef | null;
  status: ExamStatus;
  durationMinutes: number | null;
  instructions: string | null;
  tfMatrixScoring: unknown;
  composition: ExamSectionResponse[];
  totalPoints: number;
  publishedAt: string | null;
  sourceExamId: number | null;
  examVersion: number;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * `PUT /api/exams/{examId}/composition` request — STRUCTURAL ONLY (DRAFT only).
 * The client never sends snapshot fields (sourceQuestionVersionId, content,
 * options, answerKey, metadata) — the backend resolves + pins them.
 * `expectedExamVersion` is the optimistic token (the exam's current
 * `examVersion`); a mismatch → 409 EXAM_CONCURRENT_MODIFICATION.
 */
export interface CompositionQuestionRequest {
  sourceQuestionId: number;
  position: number;
  defaultPoints?: number | null;
}

export interface CompositionSectionRequest {
  position: number;
  title: string;
  instructions?: string | null;
  questions: CompositionQuestionRequest[];
}

export interface UpdateCompositionRequest {
  expectedExamVersion: number;
  durationMinutes?: number | null;
  instructions?: string | null;
  sections: CompositionSectionRequest[];
}

/** `GET /api/exams/{examId}` → teacher editor view. */
export function getExamDetail(examId: number): Promise<TeacherExamEditorResponse> {
  return http.get<TeacherExamEditorResponse>(`/api/exams/${examId}`);
}

/**
 * `PUT /api/exams/{examId}/composition` → updated editor view (with the new
 * `examVersion` and pinned snapshots). DRAFT only. The legacy
 * `/draft/composition` path is a retained alias — the canonical path is used.
 */
export function updateComposition(
  examId: number,
  req: UpdateCompositionRequest
): Promise<TeacherExamEditorResponse> {
  return http.put<TeacherExamEditorResponse>(
    `/api/exams/${examId}/composition`,
    req
  );
}

// ============================================================
// Publish / duplicate / archive
// ============================================================

/**
 * Backend `PublishExamRequest`. `expectedExamVersion` is the optimistic token;
 * absent body or null means "publish the current DRAFT". A mismatch (or a
 * concurrent publish) → 409 EXAM_PUBLISH_CONFLICT.
 */
export interface PublishExamRequest {
  expectedExamVersion?: number | null;
}

/**
 * Backend `PublishedExamSummary` (publish response, HTTP 200). Carries NO
 * answer data — only identity, points, counts.
 */
export interface PublishedExamSummary {
  examId: number;
  status: string;
  publishedAt: string;
  totalPoints: number;
  questionCount: number | null;
  durationMinutes: number | null;
}

/** `POST /api/exams/{examId}/publish` → 200 `PublishedExamSummary`. */
export function publishExam(
  examId: number,
  req: PublishExamRequest = {}
): Promise<PublishedExamSummary> {
  return http.post<PublishedExamSummary>(`/api/exams/${examId}/publish`, req);
}

/** `POST /api/exams/{examId}/duplicate` → 201 `ExamListItem` (new DRAFT copy). */
export function duplicateExam(examId: number): Promise<ExamListItem> {
  return http.post<ExamListItem>(`/api/exams/${examId}/duplicate`);
}

/**
 * `POST /api/exams/{examId}/archive` → editor response (status ARCHIVED).
 * 409 EXAM_ARCHIVE_CONFLICT while sessions are SCHEDULED/OPEN.
 */
export function archiveExam(examId: number): Promise<TeacherExamEditorResponse> {
  return http.post<TeacherExamEditorResponse>(`/api/exams/${examId}/archive`);
}
