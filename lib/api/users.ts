import { http } from "./http-client";
import type { PageResponse } from "./question-banks";

export type UserStatus = "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING";
export type AccountType = "STUDENT" | "TEACHER";

export interface UserListItem {
  id: number; username: string; email: string; displayName: string;
  status: UserStatus; roles: string[]; createdAt: string;
}

export interface UserResponse extends UserListItem {
  lockedUntil: string | null; lastLoginAt: string | null;
}

export interface UsersListParams {
  page?: number; size?: number; search?: string; status?: UserStatus; role?: string;
}

export interface CreateUserRequest {
  username: string; email: string; password: string; displayName: string;
  accountType: AccountType; phone?: string;
}

export interface UpdateUserRequest { displayName?: string; email?: string; }

export interface RoleResponse { id: number; code: string; name: string; description: string; }
export interface RoleListResponse { items: RoleResponse[]; }

export function listUsers(params: UsersListParams = {}): Promise<PageResponse<UserListItem>> {
  return http.get<PageResponse<UserListItem>>("/api/users", { params });
}
export function getUser(id: number): Promise<UserResponse> {
  return http.get<UserResponse>(`/api/users/${id}`);
}
export function createUser(req: CreateUserRequest): Promise<UserResponse> {
  return http.post<UserResponse>("/api/users", req);
}
export function updateUser(id: number, req: UpdateUserRequest): Promise<UserResponse> {
  return http.put<UserResponse>(`/api/users/${id}`, req);
}
export function activateUser(id: number): Promise<UserResponse> { return http.post<UserResponse>(`/api/users/${id}/activate`); }
export function disableUser(id: number): Promise<UserResponse> { return http.post<UserResponse>(`/api/users/${id}/disable`); }
export function lockUser(id: number): Promise<UserResponse> { return http.post<UserResponse>(`/api/users/${id}/lock`); }
export function unlockUser(id: number): Promise<UserResponse> { return http.post<UserResponse>(`/api/users/${id}/unlock`); }
export function assignRole(id: number, roleCode: string): Promise<UserResponse> {
  return http.post<UserResponse>(`/api/users/${id}/roles`, { roleCode });
}
export function removeRole(id: number, roleCode: string): Promise<UserResponse> {
  return http.delete<UserResponse>(`/api/users/${id}/roles/${encodeURIComponent(roleCode)}`);
}
export function getRoles(): Promise<RoleListResponse> {
  return http.get<RoleListResponse>("/api/roles");
}
