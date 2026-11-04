import { http } from "@/lib/api";
import type {
  AuthProvidersResponse,
  CurrentUserResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  ResendOtpResponse,
  TokenResponse,
  LinkGoogleRequest,
  LinkGoogleResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from "./types";

/**
 * Auth REST client. All paths use the full `/api/auth/*` form (matches the
 * backend `@RequestMapping("/api/auth")` controller). On rejection, callers
 * receive a `NormalizedApiError` (via FE2's response interceptor).
 */
export const authApi = {
  /** `POST /api/auth/register` → 201 `RegisterResponse`. */
  register: (req: RegisterRequest): Promise<RegisterResponse> =>
    http.post<RegisterResponse>("/api/auth/register", req),

  /** `POST /api/auth/login` → 200 `TokenResponse`. Refresh cookie set via Set-Cookie (withCredentials). */
  login: (req: LoginRequest): Promise<TokenResponse> =>
    http.post<TokenResponse>("/api/auth/login", req),

  /** `POST /api/auth/refresh` → 200 `TokenResponse`. Refresh token read from HttpOnly cookie server-side. */
  refresh: (): Promise<TokenResponse> =>
    http.post<TokenResponse>("/api/auth/refresh"),

  /** `POST /api/auth/logout` → 204 No Content. Server clears the refresh cookie. */
  logout: (): Promise<void> =>
    http.post<void>("/api/auth/logout").then(() => undefined),

  /** `GET /api/auth/me` → 200 `CurrentUserResponse`. */
  me: (): Promise<CurrentUserResponse> =>
    http.get<CurrentUserResponse>("/api/auth/me"),

  /** `POST /api/auth/verify-email` → 200 (Identity-M1). Idempotent for verified accounts. */
  verifyEmail: (req: VerifyEmailRequest): Promise<VerifyEmailResponse> =>
    http.post<VerifyEmailResponse>("/api/auth/verify-email", req),

  /** `POST /api/auth/verify-email/resend` → 200 with the cooldown window (Identity-M1). */
  resendVerificationOtp: (email: string): Promise<ResendOtpResponse> =>
    http.post<ResendOtpResponse>("/api/auth/verify-email/resend", { email }),

  /** `GET /api/auth/providers` → which SSO providers are configured. */
  providers: (): Promise<AuthProvidersResponse> =>
    http.get<AuthProvidersResponse>("/api/auth/providers"),

  /** `POST /api/auth/oauth/exchange` → 200 `TokenResponse` (one-time code from the OIDC callback). */
  exchangeOauthCode: (code: string): Promise<TokenResponse> =>
    http.post<TokenResponse>("/api/auth/oauth/exchange", { code }),

  /**
   * `POST /api/auth/upgrade-teacher` → 200 with the effective roles
   * (Identity-M2). Self-service TEACHER grant; idempotent, no body.
   */
  upgradeToTeacher: (): Promise<{ roles: string[] }> =>
    http.post<{ roles: string[] }>("/api/auth/upgrade-teacher"),

  /**
   * `POST /api/auth/oauth/google/link` → 200 with the Google authorization
   * URL (review M1-06). Requires the signed-in account's password.
   */
  startGoogleLink: (req: LinkGoogleRequest): Promise<LinkGoogleResponse> =>
    http.post<LinkGoogleResponse>("/api/auth/oauth/google/link", req),
};
