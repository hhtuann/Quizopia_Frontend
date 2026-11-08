import { http } from "./http-client";

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
