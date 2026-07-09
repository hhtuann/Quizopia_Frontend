import { http } from "./http-client";

/**
 * Classrooms API + types (school/teacher-scoped, CLASSROOM_* + CLASSROOM_MEMBER_*
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
  ownerTeacherId: number;
  createdAt: string;
}

/** Embedded roster row in {@link ClassroomDetailView}. */
export interface ClassroomMemberView {
  studentProfileId: number;
  studentCode: string;
  displayName: string;
  addedAt: string;
}

/** Backend record `ClassroomDetailView` (GET /api/classrooms/{id}). */
export interface ClassroomDetailView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  status: ClassroomStatus;
  ownerTeacherId: number;
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
  studentProfileId: number;
  studentCode: string;
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
  studentProfileIds: number[];
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

/** `DELETE /api/classrooms/{id}/members/{studentProfileId}` → 200 (no body). */
export function removeMember(id: number, studentProfileId: number): Promise<void> {
  return http.delete<void>(`/api/classrooms/${id}/members/${studentProfileId}`);
}

/** `GET /api/classrooms/{id}/members?page=&size=&sort=` (paginated). */
export function getClassroomMembers(
  id: number,
  params: ClassroomMembersParams = {}
): Promise<ClassroomMembersPage> {
  return http.get<ClassroomMembersPage>(`/api/classrooms/${id}/members`, { params });
}
