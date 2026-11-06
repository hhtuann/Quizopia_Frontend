import { http } from "./http-client";
import type { ResetPasswordValues } from "@/lib/validation/password-schema";

/**
 * Public password-recovery client (Identity M5). Both endpoints are matched by
 * `isPublicPasswordRequest` in http-client, so requests never carry
 * Authorization and never trigger the refresh interceptor. Rejections arrive
 * as `NormalizedApiError` via the shared response interceptor.
 */
export const passwordApi = {
  /**
   * `POST /api/auth/password/forgot` → 202 with the SAME generic confirmation
   * for every syntactically valid request (registered or not, throttled or
   * not). The UI must not branch on eligibility details.
   */
  forgotPassword: (email: string): Promise<void> =>
    http.post<void>("/api/auth/password/forgot", { email }).then(() => undefined),

  /**
   * `POST /api/auth/password/reset` → 204 on success. Invalid, expired,
   * replaced and already-used tokens all share one 400 code; the UI must map
   * every api failure to a single generic retry state. No tokens are issued —
   * never auto-login after a reset.
   */
  resetPassword: (values: { token: string } & ResetPasswordValues): Promise<void> =>
    http.post<void>("/api/auth/password/reset", values).then(() => undefined),
};
