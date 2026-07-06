import { http } from "@/lib/api";
import type {
  CurrentUserResponse,
  LoginRequest,
  RegisterRequest,
  RegisterResponse,
  TokenResponse,
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
};
