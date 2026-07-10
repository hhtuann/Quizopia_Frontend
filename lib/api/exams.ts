import { http } from "./http-client";
import type { PageResponse, QuestionType } from "./question-banks";

/**
 * Exams API + types (Day 6, Teacher-only). Mirrors backend records:
 *   - com.hhtuann.backend.exam.dto.ExamListItem
 *   - com.hhtuann.backend.exam.dto.ExamPurposeSummary (embedded `purpose`)
 *   - com.hhtuann.backend.question.dto.SubjectSummary (embedded `subject`)
 *   - com.hhtuann.backend.exam.dto.CreateExamRequest
 *
 * Endpoints (ExamController, prefix /api/exams):
 *   - GET  /api/exams/my  → PageResponse<ExamListItem>
 *   - POST /api/exams     → 201 ExamListItem
 * (detail / composition / versions / publish are FE7b — not used here.)
 */

/** Embedded subject — same shape as `SubjectSummary`. */
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

export type ExamStatus = "DRAFT" | "READY";

/** Backend record `ExamListItem`. */
export interface ExamListItem {
  id: number;
  code: string;
  title: string;
  subject: ExamSubjectRef;
  purpose: ExamPurposeRef | null;
  status: ExamStatus;
  currentVersionNumber: number | null;
  hasDraft: boolean;
  hasPublished: boolean;
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
 * Backend record `CreateExamRequest`. Client never sends `schoolId` /
 * `ownerTeacherId` — the backend resolves them from the teacher profile.
 * `purposeId` and `description` are nullable.
 */
export interface CreateExamRequest {
  subjectId: number;
  purposeId: number | null;
  title: string;
  description: string | null;
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
// Editor (GET detail + PUT draft composition) — FE7b
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
  difficulty: string;
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

/** Backend `ExamDraftVersionResponse`. `tfMatrixScoring` is a `JsonNode` → opaque. */
export interface ExamDraftVersionResponse {
  versionNumber: number;
  status: string;
  durationMinutes: number | null;
  instructions: string | null;
  tfMatrixScoring: unknown;
  sections: ExamSectionResponse[];
}

/** Backend `PublishedExamVersionSummary(Integer versionNumber, Instant publishedAt, BigDecimal totalPoints)`. */
export interface PublishedExamVersionSummary {
  versionNumber: number;
  publishedAt: string;
  totalPoints: number;
}

/** Backend `TeacherExamEditorResponse` (teacher editor view; carries answers). */
export interface TeacherExamEditorResponse {
  id: number;
  code: string;
  title: string;
  description: string | null;
  subject: ExamSubjectRef;
  purpose: ExamPurposeRef | null;
  status: ExamStatus;
  currentVersionNumber: number | null;
  currentDraftVersion: ExamDraftVersionResponse | null;
  publishedVersions: PublishedExamVersionSummary[];
  createdAt: string;
  updatedAt: string | null;
}

/**
 * `PUT /api/exams/{examId}/draft/composition` request — STRUCTURAL ONLY.
 * The client never sends snapshot fields (sourceQuestionVersionId, content,
 * options, answerKey, metadata) — the backend resolves + pins them.
 * `expectedVersionNumber` is the optimistic token (the current DRAFT
 * ExamVersion.versionNumber); a mismatch → 409 EXAM_CONCURRENT_MODIFICATION.
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

export interface UpdateDraftCompositionRequest {
  expectedVersionNumber: number;
  durationMinutes?: number | null;
  instructions?: string | null;
  sections: CompositionSectionRequest[];
}

/** `GET /api/exams/{examId}` → teacher editor view. */
export function getExamDetail(examId: number): Promise<TeacherExamEditorResponse> {
  return http.get<TeacherExamEditorResponse>(`/api/exams/${examId}`);
}

/** `PUT /api/exams/{examId}/draft/composition` → updated teacher editor view (with pinned snapshot). */
export function updateDraftComposition(
  examId: number,
  req: UpdateDraftCompositionRequest
): Promise<TeacherExamEditorResponse> {
  return http.put<TeacherExamEditorResponse>(
    `/api/exams/${examId}/draft/composition`,
    req
  );
}

// ============================================================
// Publish + create-next-draft (FE7c)
// ============================================================

/**
 * Backend `PublishExamRequest`. `expectedVersionNumber` is the optimistic
 * token (current DRAFT version); null/absent = "publish the current DRAFT".
 * Mismatch/concurrent → 409 EXAM_PUBLISH_CONFLICT.
 */
export interface PublishExamRequest {
  expectedVersionNumber?: number | null;
}

/**
 * Backend `PublishedExamSummary` (publish response, HTTP 200). Carries NO
 * answer data — only identity, points, counts.
 */
export interface PublishedExamSummary {
  examId: number;
  versionNumber: number;
  status: string;
  publishedAt: string;
  totalPoints: number;
  questionCount: number | null;
  durationMinutes: number | null;
}

/** Backend `CreateExamVersionRequest`. `cloneFromVersionNumber` null = clone latest PUBLISHED. */
export interface CreateExamVersionRequest {
  cloneFromVersionNumber?: number | null;
}

/** Backend `CreateExamVersionResponse` (create-next-draft, HTTP 201). NO answer data. */
export interface CreateExamVersionResponse {
  versionNumber: number;
  status: string;
  clonedFrom: number | null;
}

/** `POST /api/exams/{examId}/publish` → 200 `PublishedExamSummary`. */
export function publishExam(
  examId: number,
  req: PublishExamRequest = {}
): Promise<PublishedExamSummary> {
  return http.post<PublishedExamSummary>(`/api/exams/${examId}/publish`, req);
}

/** `POST /api/exams/{examId}/versions` → 201 `CreateExamVersionResponse` (clone latest PUBLISHED when no body). */
export function createNextDraft(
  examId: number,
  req: CreateExamVersionRequest = {}
): Promise<CreateExamVersionResponse> {
  return http.post<CreateExamVersionResponse>(`/api/exams/${examId}/versions`, req);
}
