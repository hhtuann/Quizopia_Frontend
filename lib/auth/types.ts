/**
 * Auth DTOs — mirror backend records field-for-field.
 *
 * Verified against:
 *   - com.hhtuann.backend.authentication.dto.LoginRequest
 *   - com.hhtuann.backend.authentication.dto.RegisterRequest
 *   - com.hhtuann.backend.authentication.dto.AccountType
 *   - com.hhtuann.backend.authentication.dto.TokenResponse
 *   - com.hhtuann.backend.authentication.dto.RegisterResponse
 *   - com.hhtuann.backend.authentication.dto.CurrentUserResponse
 *   - com.hhtuann.backend.identity.domain.model.UserStatus
 *
 * No drift vs. the FE3 task spec.
 */

/** Backend enum `AccountType { STUDENT, TEACHER }`. */
export type AccountType = "STUDENT" | "TEACHER";

/** Backend enum `UserStatus { ACTIVE, LOCKED, DISABLED, PENDING }`. */
export type UserStatus = "ACTIVE" | "LOCKED" | "DISABLED" | "PENDING";

/** Backend record `LoginRequest(identifier, password)`. */
export interface LoginRequest {
  /** Username (no `@`) or email (contains `@`); service picks lookup strategy. */
  identifier: string;
  password: string;
}

/** Backend record `RegisterRequest(...)`. */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName: string;
  phone: string;
  nationalId: string;
  /** `null`/`undefined` defaults to STUDENT server-side. */
  accountType?: AccountType | null;
  /** Required only when `accountType === "TEACHER"`. */
  teacherInviteCode?: string | null;
}

/** Backend record `TokenResponse(...)`. Refresh token is HttpOnly-only. */
export interface TokenResponse {
  accessToken: string;
  /** Always `Bearer`. */
  tokenType: string;
  /** ISO-8601 instant (Jackson serializes `Instant` as ISO-8601 string). */
  expiresAt: string;
  /** Access-token lifetime in seconds. */
  expiresInSeconds: number;
  /** Effective role codes. */
  roles: string[];
}

/** Backend record `RegisterResponse(...)`. No ciphertext/hash/token echoed. */
export interface RegisterResponse {
  id: number;
  username: string;
  email: string;
  displayName: string;
  phone: string;
  nationalId: string;
  status: UserStatus;
  roles: string[];
}

/** Backend record `CurrentUserResponse(...)` for `GET /api/auth/me`. */
export interface CurrentUserResponse {
  id: number;
  username: string;
  email: string;
  displayName: string;
  phone: string;
  nationalId: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
}
