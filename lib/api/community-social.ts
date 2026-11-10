import { http } from "./http-client";
import { extractAxiosError, type NormalizedApiError } from "./errors";
import { parseRetryAfterSeconds } from "./community-fork";

/**
 * Community social-summary + like/rating API (P3-C3, issue #67 — ADR-007
 * §5/§7 frozen contract; the backend lands with #65 in parallel, so the FE
 * codes against the contract and mocks the transport in tests).
 *
 * Two summary routes, one shape family: the ANONYMOUS twin
 * (`/api/public/community/...`) carries aggregates only — never any caller
 * state — and is what renders for guests; the AUTHENTICATED twin adds the
 * caller's own `liked`/`myRating` and nothing else (no other user ids exist
 * anywhere in these DTOs). Like/rating writes are idempotent upserts whose
 * responses already carry the fresh post-write state.
 *
 * Error classification follows the #46/#48 precedent: a 404 means the
 * publication no longer passes the §4 visibility predicate ("gone" — same
 * byte-identical anti-enumeration 404 as every community route), 401 means
 * the session expired at AuthN after the single-flight refresh retry, 429 is
 * the §5 rate window (with `Retry-After`), and 409
 * `COMMUNITY_SELF_RATING_NOT_ALLOWED` is the publisher-rating-own-quiz block.
 */

/** §5 anonymous social-summary — aggregates only, never caller states. */
export interface PublicSocialSummary {
  likeCount: number;
  /** Mean of visible ratings, or `null` when `ratingCount` is 0. */
  average: number | null;
  ratingCount: number;
  commentCount: number;
}

/** §5 authenticated twin — the aggregates plus the caller's own states ONLY. */
export interface SocialSummary extends PublicSocialSummary {
  liked: boolean;
  myRating: number | null;
}

/** `PUT/DELETE …/like` result — fresh like state after the idempotent write. */
export interface LikeState {
  likeCount: number;
  liked: boolean;
}

/** `PUT/DELETE …/rating` result — `myRating` is `null` after DELETE. */
export interface RatingState {
  average: number | null;
  ratingCount: number;
  myRating: number | null;
}

/**
 * `GET /api/public/community/publications/{id}/social-summary` — anonymous
 * aggregates (sixth public GET). Guest-visible by design.
 */
export function getPublicSocialSummary(
  publicationId: number
): Promise<PublicSocialSummary> {
  return http.get(
    `/api/public/community/publications/${publicationId}/social-summary`
  );
}

/**
 * `GET /api/community/publications/{id}/social-summary` — authenticated twin:
 * aggregates + the caller's own `liked`/`myRating`.
 */
export function getSocialSummary(publicationId: number): Promise<SocialSummary> {
  return http.get(
    `/api/community/publications/${publicationId}/social-summary`
  );
}

/**
 * `PUT /api/community/publications/{id}/like` — 201 first like / 200
 * idempotent re-PUT; `{likeCount, liked:true}`.
 */
export function putLike(publicationId: number): Promise<LikeState> {
  return http.put(`/api/community/publications/${publicationId}/like`);
}

/**
 * `DELETE /api/community/publications/{id}/like` — 200 always;
 * `{likeCount, liked:false}`.
 */
export function deleteLike(publicationId: number): Promise<LikeState> {
  return http.delete(`/api/community/publications/${publicationId}/like`);
}

/**
 * `PUT /api/community/publications/{id}/rating` `{rating: 1..5}` — 201 first
 * rating / 200 update (publisher self-rating → 409, see classifier);
 * `{average, ratingCount, myRating}`.
 */
export function putRating(
  publicationId: number,
  rating: number
): Promise<RatingState> {
  return http.put(`/api/community/publications/${publicationId}/rating`, {
    rating,
  });
}

/**
 * `DELETE /api/community/publications/{id}/rating` — 200 always;
 * `{average, ratingCount, myRating:null}`.
 */
export function deleteRating(publicationId: number): Promise<RatingState> {
  return http.delete(`/api/community/publications/${publicationId}/rating`);
}

/** Failure classes the social UX distinguishes (see module doc). */
export type SocialErrorKind =
  /** 404 — publication no longer passes the §4 predicate. */
  | "gone"
  /** 401 — session expired at AuthN after the single-flight refresh retry. */
  | "unauthenticated"
  /** 409 `COMMUNITY_SELF_RATING_NOT_ALLOWED` — the publisher's own quiz. */
  | "selfRating"
  /** 429 — §5 rate window (see `retryAfterSeconds`). */
  | "rateLimited"
  /** Request sent, no response — safe to retry. */
  | "network"
  /** Anything else. */
  | "other";

/** {@link classifySocialError} result. */
export interface SocialErrorClassification {
  kind: SocialErrorKind;
  /**
   * `Retry-After` on 429, in whole seconds. `null` when absent/unparseable
   * or the failure is not a 429.
   */
  retryAfterSeconds: number | null;
}

/** Reduce any thrown value to a {@link SocialErrorClassification}. Never throws. */
export function classifySocialError(err: unknown): SocialErrorClassification {
  const none = { kind: "other" as const, retryAfterSeconds: null };
  const norm = err as NormalizedApiError | undefined;
  if (!norm) return none;
  if (norm.kind === "network") {
    return { kind: "network", retryAfterSeconds: null };
  }
  if (norm.kind !== "api") return none;
  switch (norm.status) {
    case 404:
      return { kind: "gone", retryAfterSeconds: null };
    case 401:
      return { kind: "unauthenticated", retryAfterSeconds: null };
    case 409:
      if (norm.code === "COMMUNITY_SELF_RATING_NOT_ALLOWED") {
        return { kind: "selfRating", retryAfterSeconds: null };
      }
      return none;
    case 429: {
      // The header lives on the raw AxiosError (the NormalizedApiError
      // surface deliberately carries only the ApiError body). Axios
      // normalizes header names to lower-case; both spellings are probed.
      const axiosErr = extractAxiosError(norm);
      const headers = axiosErr?.response?.headers as
        | Record<string, unknown>
        | undefined;
      const retryAfterSeconds = parseRetryAfterSeconds(
        headers?.["retry-after"] ?? headers?.["Retry-After"]
      );
      return { kind: "rateLimited", retryAfterSeconds };
    }
    default:
      return none;
  }
}
