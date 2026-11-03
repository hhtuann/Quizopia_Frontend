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

/** Backend record `RegisterRequest(...)` (Identity-M1: STUDENT-only, no role choice). */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  displayName: string;
  phone: string;
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

/** Backend record `RegisterResponse(...)` (Identity-M1 verification fields). */
export interface RegisterResponse {
  id: number;
  username: string;
  email: string;
  displayName: string;
  phone: string;
  status: UserStatus;
  roles: string[];
  /** Always true for new registrations (Identity-M1). */
  emailVerificationRequired: boolean;
  /** Whether the OTP mail was accepted by the transport. */
  emailSent: boolean;
}

/** Backend record `VerifyEmailRequest(email, otp)` for `POST /api/auth/verify-email`. */
export interface VerifyEmailRequest {
  email: string;
  otp: string;
}

/** Response of `POST /api/auth/verify-email`. */
export interface VerifyEmailResponse {
  verified: boolean;
}

/** Response of `POST /api/auth/verify-email/resend`. */
export interface ResendOtpResponse {
  resendCooldownSeconds: number;
}

/** Response of `GET /api/auth/providers` (which SSO buttons to render). */
export interface AuthProvidersResponse {
  googleEnabled: boolean;
}

/** Backend record `CurrentUserResponse(...)` for `GET /api/auth/me`. */
export interface CurrentUserResponse {
  id: number;
  username: string;
  email: string;
  displayName: string;
  phone: string;
  status: UserStatus;
  /** Identity-M1: email verified (OTP or trusted OIDC provider). */
  emailVerified: boolean;
  roles: string[];
  permissions: string[];
}
