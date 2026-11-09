import { http, httpClient } from "./http-client";

/**
 * Classrooms API + types (user-owned, CLASSROOM_* + CLASSROOM_MEMBER_*
 * permissions). Mirrors the backend records in `com.hhtuann.backend.classroom.dto`.
 */

/** Backend `ClassroomStatus` enum (ACTIVE | ARCHIVED). */
export type ClassroomStatus = "ACTIVE" | "ARCHIVED";

/** Backend record `ClassroomResponse`. */
export interface ClassroomResponse {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  memberCount: number;
  ownerUserId: number;
  createdAt: string;
}

/** Embedded roster row in {@link ClassroomDetailView}. */
export interface ClassroomMemberView {
  userId: number;
  displayName: string;
  username: string | null;
  email: string | null;
  addedAt: string;
}

/** Backend record `ClassroomDetailView` (GET /api/classrooms/{id}). */
export interface ClassroomDetailView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  ownerUserId: number;
  createdAt: string;
  memberCount: number;
  members: ClassroomMemberView[];
}

/** Backend record `MyClassroomsResponse`. */
export interface MyClassroomsResponse {
  items: ClassroomResponse[];
}

/** Backend record `ClassroomMemberResponse` (paginated members endpoint). */
export interface ClassroomMemberResponse {
  id: number;
  userId: number;
  displayName: string;
  addedAt: string;
}

/** `PageResponse<ClassroomMemberResponse>` shape (GET .../members). */
export interface ClassroomMembersPage {
  items: ClassroomMemberResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

// ---------------------------------------------------------------------------
// CLASS-M1 (issue #50): joined membership projection + self-leave
// ---------------------------------------------------------------------------

/** Backend record `JoinedClassroomResponse` (GET /api/classrooms/joined). */
export interface JoinedClassroomResponse {
  classroomId: number;
  code: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  teacherDisplayName: string;
  joinedAt: string;
}

/** `PageResponse<JoinedClassroomResponse>` shape. */
export interface JoinedClassroomsPage {
  items: JoinedClassroomResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** `GET /api/classrooms/joined?page=&size=` — the caller's current memberships. */
export function getJoinedClassrooms(
  params: { page?: number; size?: number } = {}
): Promise<JoinedClassroomsPage> {
  return http.get<JoinedClassroomsPage>("/api/classrooms/joined", { params });
}

/** `POST /api/classrooms/{id}/leave` → 204 (learner self-exit). */
export function leaveClassroom(id: number): Promise<void> {
  return http.post<void>(`/api/classrooms/${id}/leave`, {});
}

/** Body for `POST /api/classrooms`. */
export interface CreateClassroomRequest {
  code: string;
  name: string;
  description: string | null;
}

/** Body for `PUT /api/classrooms/{id}` (both fields optional; null = no change). */
export interface UpdateClassroomRequest {
  name: string | null;
  description: string | null;
}

/** Body for `POST /api/classrooms/{id}/members`. */
export interface AddMembersRequest {
  userIds: number[];
}

/** Partial-success result of `POST /api/classrooms/{id}/members`. */
export interface AddMembersResponse {
  added: number;
  duplicated: number[];
  invalid: number[];
  /** CLASS-M1 gate F1 (#50 decision 6): users refused because they
   *  previously left this classroom (standing opt-out) — the teacher must
   *  send an invitation the learner explicitly accepts. */
  declined: number[];
}

export interface ClassroomMembersParams {
  page?: number;
  size?: number;
  sort?: string;
}

/** `POST /api/classrooms` → 201 ClassroomResponse. */
export function createClassroom(req: CreateClassroomRequest): Promise<ClassroomResponse> {
  return http.post<ClassroomResponse>("/api/classrooms", req);
}

/** `GET /api/classrooms/my`. */
export function getMyClassrooms(): Promise<MyClassroomsResponse> {
  return http.get<MyClassroomsResponse>("/api/classrooms/my");
}

/** `GET /api/classrooms/{id}` → ClassroomDetailView (with full member roster). */
export function getClassroom(id: number): Promise<ClassroomDetailView> {
  return http.get<ClassroomDetailView>(`/api/classrooms/${id}`);
}

/** `PUT /api/classrooms/{id}` → ClassroomResponse. */
export function updateClassroom(id: number, req: UpdateClassroomRequest): Promise<ClassroomResponse> {
  return http.put<ClassroomResponse>(`/api/classrooms/${id}`, req);
}

/** `POST /api/classrooms/{id}/members` → partial-success AddMembersResponse. */
export function addMembers(id: number, req: AddMembersRequest): Promise<AddMembersResponse> {
  return http.post<AddMembersResponse>(`/api/classrooms/${id}/members`, req);
}

/** `DELETE /api/classrooms/{id}/members/{userId}` → 200 (no body). */
export function removeMember(id: number, userId: number): Promise<void> {
  return http.delete<void>(`/api/classrooms/${id}/members/${userId}`);
}

/** `GET /api/classrooms/{id}/members?page=&size=&sort=` (paginated). */
export function getClassroomMembers(
  id: number,
  params: ClassroomMembersParams = {}
): Promise<ClassroomMembersPage> {
  return http.get<ClassroomMembersPage>(`/api/classrooms/${id}/members`, { params });
}

// ---------------------------------------------------------------------------
// Identity-M3 roster (pending invitations, verified-email linking)
// ---------------------------------------------------------------------------

/** Backend record `RosterEntryResponse` (teacher + learner projections). */
export interface RosterEntryResponse {
  id: number;
  classroomId: number;
  status: "PENDING" | "LINKED" | "REVOKED" | "DECLINED";
  userId: number | null;
  fullName: string;
  studentNumber: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  dob: string | null;
  phone: string | null;
  parentPhone: string | null;
  email: string | null;
  createdAt: string;
  linkedAt: string | null;
  /** CLASS-M1 learner-projection enrichment (null on teacher projections). */
  classroomName: string | null;
  teacherDisplayName: string | null;
}

/** Body for `POST /api/classrooms/{id}/roster`. */
export interface CreateRosterEntryRequest {
  fullName: string;
  studentNumber?: string | null;
  gender?: "MALE" | "FEMALE" | "OTHER" | null;
  dob?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  email: string;
}

/** `GET /api/classrooms/{id}/roster` (page shape). */
export interface ClassroomRosterPage {
  items: RosterEntryResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** `POST /api/classrooms/{id}/roster` → 201 RosterEntryResponse. */
export function addRosterEntry(
  id: number,
  req: CreateRosterEntryRequest
): Promise<RosterEntryResponse> {
  return http.post<RosterEntryResponse>(`/api/classrooms/${id}/roster`, req);
}

/** `GET /api/classrooms/{id}/roster` → ClassroomRosterPage. */
export function getClassroomRoster(id: number, params: { page?: number; size?: number } = {}): Promise<ClassroomRosterPage> {
  return http.get<ClassroomRosterPage>(`/api/classrooms/${id}/roster`, { params });
}

/** `DELETE /api/classrooms/{id}/roster/{entryId}` → 204 (revoke PENDING). */
export function revokeRosterEntry(id: number, entryId: number): Promise<void> {
  return http.delete<void>(`/api/classrooms/${id}/roster/${entryId}`);
}

// CLASS-M1 (issue #50): getMyRosterEntries + declineRosterEntry were removed
// — GET /joined is the class-list source of truth and POST /{id}/leave
// subsumes decline for learners server-side. The backend endpoints remain
// for API stability.

// ---------------------------------------------------------------------------
// Identity-M4 roster XLSX import (template / preview / confirm)
// ---------------------------------------------------------------------------

/** Backend record `RosterImportService.PreviewRow`. */
export interface RosterPreviewRow {
  sheetRow: number;
  fullName: string | null;
  studentNumber: string | null;
  gender: string | null;
  dob: string | null;
  phone: string | null;
  parentPhone: string | null;
  email: string | null;
  status: "READY" | "DUPLICATE_IN_FILE" | "DUPLICATE_IN_CLASS" | "ERROR";
  issues: string[];
}

/** Backend record `RosterImportService.PreviewResult`. */
export interface RosterPreviewResult {
  totalRows: number;
  ready: number;
  rows: RosterPreviewRow[];
}

/** Backend record `RosterImportService.ConfirmResult`. */
export interface RosterConfirmResult {
  imported: number;
  duplicates: number;
  failed: number;
  errors: { sheetRow: number; column: string; message: string }[];
}

/** `GET /api/classrooms/{id}/roster-import/template` (xlsx blob). */
export function downloadRosterTemplate(id: number): Promise<Blob> {
  return http.get<Blob>(`/api/classrooms/${id}/roster-import/template`, {
    responseType: "blob",
  });
}

/** `POST /api/classrooms/{id}/roster-import/preview` (read-only). */
export function previewRosterImport(id: number, file: File): Promise<RosterPreviewResult> {
  const form = new FormData();
  form.append("file", file);
  return http.post<RosterPreviewResult>(`/api/classrooms/${id}/roster-import/preview`, form);
}

/** `POST /api/classrooms/{id}/roster-import/confirm` (idempotent batch). */
export function confirmRosterImport(id: number, file: File): Promise<RosterConfirmResult> {
  const form = new FormData();
  form.append("file", file);
  return http.post<RosterConfirmResult>(`/api/classrooms/${id}/roster-import/confirm`, form);
}

/** `GET /api/classrooms/roster/invitations` → PENDING entries awaiting consent. */
export function getMyRosterInvitations(): Promise<RosterEntryResponse[]> {
  return http.get<RosterEntryResponse[]>("/api/classrooms/roster/invitations");
}

/** `POST /api/classrooms/roster/{entryId}/accept` → learner consent (relink path). */
export function acceptRosterInvitation(entryId: number): Promise<RosterEntryResponse> {
  return http.post<RosterEntryResponse>(`/api/classrooms/roster/${entryId}/accept`, {});
}

// ---------------------------------------------------------------------------
// CLASS-M2 (issue #52): classroom sessions (teacher + learner)
// ---------------------------------------------------------------------------

/** Backend `ExamSessionStatus` (re-exported for convenience here). */
export type ClassroomSessionStatus = "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "CANCELLED";

/** Backend record `ClassroomSessionItem` (GET /api/classrooms/{id}/sessions). */
export interface ClassroomSessionItem {
  sessionId: number;
  code: string;
  title: string;
  status: ClassroomSessionStatus;
  visibility: "PUBLIC" | "CLASS_RESTRICTED";
  startsAt: string;
  endsAt: string;
  examId: number;
  examTitle: string;
}

/** Backend record `AssignableSessionItem` (GET .../sessions/assignable). */
export interface AssignableSessionItem {
  sessionId: number;
  code: string;
  title: string;
  status: "DRAFT" | "SCHEDULED";
  startsAt: string;
  endsAt: string;
  examId: number;
  examTitle: string;
}

/** Backend record `LearnerClassroomSessionItem` (GET /joined/{id}/sessions). */
export interface LearnerClassroomSessionItem {
  sessionId: number;
  code: string;
  title: string;
  status: Exclude<ClassroomSessionStatus, "DRAFT">;
  startsAt: string;
  endsAt: string;
  examTitle: string;
}

/** Backend record `JoinedClassroomDetail` (GET /api/classrooms/joined/{id}). */
export interface JoinedClassroomDetail {
  classroomId: number;
  code: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  teacherDisplayName: string;
  joinedAt: string;
  assignedSessionCount: number;
}

/** `PageResponse<T>` shape used by the class-session endpoints. */
export interface ClassroomSessionsPage<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** Params for `GET /api/classrooms/{id}/sessions` (teacher). */
export interface ClassroomSessionsParams {
  page?: number;
  size?: number;
  status?: string;
  search?: string;
}

/** `GET /api/classrooms/{id}/sessions` — assigned sessions (owner view). */
export function getClassroomSessions(
  id: number,
  params: ClassroomSessionsParams = {}
): Promise<ClassroomSessionsPage<ClassroomSessionItem>> {
  return http.get<ClassroomSessionsPage<ClassroomSessionItem>>(
    `/api/classrooms/${id}/sessions`,
    { params }
  );
}

/** `GET /api/classrooms/{id}/sessions/assignable` — own eligible sessions not
 *  yet assigned to this classroom (the assign picker). */
export function getAssignableSessions(
  id: number,
  params: { page?: number; size?: number; search?: string } = {}
): Promise<ClassroomSessionsPage<AssignableSessionItem>> {
  return http.get<ClassroomSessionsPage<AssignableSessionItem>>(
    `/api/classrooms/${id}/sessions/assignable`,
    { params }
  );
}

/** `POST /api/classrooms/{id}/sessions/{sessionId}` → 204 (additive, idempotent). */
export function assignSessionToClassroom(id: number, sessionId: number): Promise<void> {
  return http.post<void>(`/api/classrooms/${id}/sessions/${sessionId}`, {});
}

/** `DELETE /api/classrooms/{id}/sessions/{sessionId}` → 204 (idempotent). */
export function unassignSessionFromClassroom(id: number, sessionId: number): Promise<void> {
  return http.delete<void>(`/api/classrooms/${id}/sessions/${sessionId}`);
}

/** `GET /api/classrooms/joined/{id}` — learner-safe detail (members only). */
export function getJoinedClassroom(id: number): Promise<JoinedClassroomDetail> {
  return http.get<JoinedClassroomDetail>(`/api/classrooms/joined/${id}`);
}

/** `GET /api/classrooms/joined/{id}/sessions` — learner-safe assigned sessions. */
export function getJoinedClassroomSessions(
  id: number,
  params: { page?: number; size?: number; status?: string } = {}
): Promise<ClassroomSessionsPage<LearnerClassroomSessionItem>> {
  return http.get<ClassroomSessionsPage<LearnerClassroomSessionItem>>(
    `/api/classrooms/joined/${id}/sessions`,
    { params }
  );
}
// ---------------------------------------------------------------------------
// CLASS-M3 (issue #54): gradebook + analytics + learner my-results
// ---------------------------------------------------------------------------

/** Backend `GradebookSessionColumn.windowState`. */
export type GradebookWindowState = "UPCOMING" | "WINDOW" | "NOT_HELD" | "DRAFT" | "CANCELLED";

/** Backend record `GradebookSessionColumn` (GET .../gradebook/sessions). */
export interface GradebookSessionColumn {
  id: number;
  code: string;
  title: string;
  status: ClassroomSessionStatus;
  startsAt: string;
  endsAt: string;
  windowState: GradebookWindowState;
  examId: number;
  examTitle: string;
  cohortSize: number;
  startedCount: number;
  submittedCount: number;
  gradedCount: number;
  completionPercentage: number | null;
  averagePercentage: number | null;
}

/** `PageResponse<GradebookSessionColumn>` shape. */
export interface GradebookSessionsPage {
  items: GradebookSessionColumn[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** Backend `GradebookCellStatus` (per student × session cell / result). */
export type GradebookCellStatus =
  | "SCORED"
  | "PENDING_GRADING"
  | "IN_PROGRESS"
  | "NOT_ATTEMPTED"
  | "NOT_IN_COHORT"
  | "UPCOMING"
  | "DRAFT"
  | "CANCELLED"
  | "NOT_HELD";

/** Backend record `GradebookCell` — cells[] index aligns with sessions[] order. */
export interface GradebookCell {
  status: GradebookCellStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  bestAttemptId: number | null;
  attemptCount: number | null;
  gradeStatus: string | null;
}

/** Backend record `GradebookStudentRow`. */
export interface GradebookStudentRow {
  userId: number;
  displayName: string;
  currentMember: boolean;
  cells: GradebookCell[];
  meanPercentage: number | null;
  cohortSessions: number;
  submittedSessions: number;
  completionPercentage: number | null;
}

/** Backend record `GradebookResponse` (paged students + aligned sessions). */
export interface GradebookResponse {
  sessions: GradebookSessionColumn[];
  students: GradebookStudentRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
  historyCoverage: "SINCE_MIGRATION";
}

/** Sortable gradebook fields (server `sort` param). */
export type GradebookSortField = "displayName" | "meanPercentage" | "completion";

/** Params for `GET /api/classrooms/{id}/gradebook`. */
export interface GradebookParams {
  /** Explicit session-column selection; omitted → server default (first 5). */
  sessionIds?: number[];
  page?: number;
  size?: number;
  search?: string;
  sort?: GradebookSortField;
  direction?: "asc" | "desc";
}

/** Per-session trend row inside {@link ClassroomAnalyticsResponse} (chronological, ≤20). */
export interface ClassroomAnalyticsSessionItem {
  sessionId: number;
  code: string;
  title: string;
  status: ClassroomSessionStatus;
  startsAt: string;
  cohortSize: number;
  startedCount: number;
  submittedCount: number;
  gradedCount: number;
  completionPercentage: number | null;
  averagePercentage: number | null;
}

/** Backend record `ClassroomAnalyticsResponse` (class-wide, sessionId null). */
export interface ClassroomAnalyticsResponse {
  sessionId: null;
  currentRosterSize: number;
  assignedSessionCount: number;
  overallCompletionPercentage: number | null;
  sessions: ClassroomAnalyticsSessionItem[];
  historyCoverage: "SINCE_MIGRATION";
}

/** Backend record `LearnerMyResultsItem` (GET /joined/{id}/my-results). */
export interface LearnerMyResultsItem {
  sessionId: number;
  code: string;
  title: string;
  status: ClassroomSessionStatus;
  startsAt: string;
  endsAt: string;
  examTitle: string;
  resultStatus: GradebookCellStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  bestAttemptId: number | null;
  attemptCount: number | null;
}

/** `PageResponse<LearnerMyResultsItem>` shape. */
export interface LearnerMyResultsPage {
  items: LearnerMyResultsItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** `GET /api/classrooms/{id}/gradebook/sessions` — the column catalog. */
export function getGradebookSessions(
  id: number,
  params: { page?: number; size?: number } = {}
): Promise<GradebookSessionsPage> {
  return http.get<GradebookSessionsPage>(`/api/classrooms/${id}/gradebook/sessions`, { params });
}

/** `GET /api/classrooms/{id}/gradebook` — the student × session matrix. */
export function getGradebook(id: number, params: GradebookParams = {}): Promise<GradebookResponse> {
  const { sessionIds, ...rest } = params;
  return http.get<GradebookResponse>(`/api/classrooms/${id}/gradebook`, {
    params: sessionIds ? { sessionIds: sessionIds.join(","), ...rest } : rest,
  });
}

/** `GET /api/classrooms/{id}/analytics` — class-wide KPIs (no sessionId). */
export function getClassroomAnalytics(id: number): Promise<ClassroomAnalyticsResponse> {
  return http.get<ClassroomAnalyticsResponse>(`/api/classrooms/${id}/analytics`);
}

/** Blob + filename of a gradebook XLSX export. */
export interface GradebookExport {
  blob: Blob;
  filename: string;
}

/**
 * `GET /api/classrooms/{id}/gradebook/export?sessionIds=` — XLSX blob with the
 * filename taken from `Content-Disposition` (falling back to the documented
 * `quizopia-class-{id}-gradebook-{timestamp}.xlsx` pattern). An optional
 * `search` mirrors the matrix's active student filter so the export matches
 * what the teacher sees.
 */
export async function exportGradebook(
  id: number,
  sessionIds: number[],
  search?: string
): Promise<GradebookExport> {
  const res = await httpClient.get<Blob>(`/api/classrooms/${id}/gradebook/export`, {
    responseType: "blob",
    params: search ? { sessionIds: sessionIds.join(","), search } : { sessionIds: sessionIds.join(",") },
  });
  const disposition = String(res.headers?.["content-disposition"] ?? "");
  const starred = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename =
    decodeURIComponent((starred?.[1] ?? plain?.[1] ?? "").trim()) ||
    `quizopia-class-${id}-gradebook-${stamp}.xlsx`;
  return { blob: res.data, filename };
}

/** `GET /api/classrooms/joined/{id}/my-results` — learner result summary. */
export function getMyResults(
  id: number,
  params: { page?: number; size?: number } = {}
): Promise<LearnerMyResultsPage> {
  return http.get<LearnerMyResultsPage>(`/api/classrooms/joined/${id}/my-results`, { params });
}
