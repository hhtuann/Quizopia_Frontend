import { http } from "./http-client";
import { extractAxiosError, type NormalizedApiError } from "./errors";
import { parseRetryAfterSeconds } from "./community-fork";

/**
 * Community comments API (P3-C4, issue #68 — ADR-007 §5/§7 frozen contract;
 * the backend lands with #66 in parallel, so the FE codes against the
 * contract and mocks the transport in tests).
 *
 * The public list is ANONYMOUS (fifth public GET) and carries VISIBLE
 * comments only — no tombstone rows, no `state` field, and critically NO
 * user ids: an author is identified publicly only by their account
 * `authorName` — the CURRENT profile `displayName`, resolved server-side
 * (Rev 4 / #72; never client-supplied; duplicates allowed; renames are
 * reflected on existing rows). When the request carries a valid session,
 * each item also carries the server-computed `isMine` ownership flag;
 * anonymous callers get `false` everywhere. Writes are authenticated;
 * the comment-scoped owner routes (PATCH/DELETE) check existence +
 * ownership only, and every 404 on a given route is byte-identical
 * (anti-enumeration).
 *
 * Error classification follows the #46/#48/#67 precedent: 404 means the
 * publication (or, on owner routes, the comment) no longer qualifies
 * ("gone"), 409 `COMMUNITY_COMMENT_STATE_INVALID` is an edit against a
 * non-VISIBLE comment (delete-then-edit), 401 means the session expired
 * after the single-flight refresh retry, and 429 is the §5 comment-write
 * window (with `Retry-After`).
 */

/** §5 public comment item — all VISIBLE, `state` implicit. */
export interface CommunityComment {
  commentId: number;
  /**
   * Rev 4 / #72: the author's CURRENT account `displayName`, resolved
   * server-side — the only author identity on the public surface.
   */
  authorName: string;
  /** Plain text, stored verbatim, rendered escaped by React. */
  body: string;
  createdAt: string;
  /** Set iff the comment was edited; `null` otherwise. */
  editedAt: string | null;
  /**
   * Server-computed ownership for THIS caller (true only when the
   * authenticated viewer authored the comment; `false` when anonymous).
   * Never derived from name text on the client.
   */
  isMine: boolean;
}

/**
 * `PageResponse` shape verbatim (`items,page,size,totalElements,totalPages,
 * sort`); fixed `created_at DESC, id DESC` order (newest first).
 */
export interface CommentPage {
  items: CommunityComment[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  sort: string;
}

/** List params — 0-based page, size 1..50 (backend clamps too). */
export interface CommentListParams {
  page: number;
  size: number;
}

/** §5 size bounds (the backend PageResponse clamps to the same range). */
export const MAX_COMMENT_PAGE_SIZE = 50;
/** §5 default page size. */
export const DEFAULT_COMMENT_PAGE_SIZE = 20;

/**
 * `GET /api/public/community/publications/{id}/comments?page&size` —
 * anonymous, VISIBLE-only, newest-first.
 */
export function listComments(
  publicationId: number,
  params: CommentListParams
): Promise<CommentPage> {
  return http.get(`/api/public/community/publications/${publicationId}/comments`, {
    params,
  });
}

/** §5 create body — `body` only; identity is the authenticated user (Rev 4 / #72). */
export interface CreateCommentInput {
  body: string;
}

/**
 * `POST /api/community/publications/{id}/comments` — 201 comment DTO; the
 * author name is derived from the caller's account by the server (a legacy
 * `alias` field, if sent, is ignored and can never override it).
 */
export function createComment(
  publicationId: number,
  input: CreateCommentInput
): Promise<CommunityComment> {
  return http.post(`/api/community/publications/${publicationId}/comments`, input);
}

/**
 * `PATCH /api/community/comments/{commentId}` `{body}` — owner only; 200
 * comment DTO (sets `edited_at`); foreign/absent → 404, non-VISIBLE → 409.
 */
export function updateComment(
  commentId: number,
  input: { body: string }
): Promise<CommunityComment> {
  return http.patch(`/api/community/comments/${commentId}`, input);
}

/**
 * `DELETE /api/community/comments/{commentId}` — owner only; 200 always
 * (idempotent); foreign/absent → 404.
 */
export function deleteComment(commentId: number): Promise<void> {
  return http.delete(`/api/community/comments/${commentId}`);
}

/** §3 `community_comment_reports.reason_code` — same 5 values as publication reports. */
export const COMMENT_REPORT_REASONS = [
  "INAPPROPRIATE_CONTENT",
  "COPYRIGHT",
  "MISLEADING",
  "SPAM",
  "OTHER",
] as const;
export type CommentReportReason = (typeof COMMENT_REPORT_REASONS)[number];

/** §5 report body — `details` capped at 500 characters server-side. */
export interface CommentReportInput {
  reasonCode: CommentReportReason;
  details?: string;
}

/**
 * `POST /api/community/comments/{commentId}/reports` — 201 first report,
 * 200 idempotent dedupe (one OPEN report per reporter per comment).
 */
export function reportComment(
  commentId: number,
  input: CommentReportInput
): Promise<void> {
  return http.post(`/api/community/comments/${commentId}/reports`, input);
}

/** Failure classes the comment UX distinguishes (see module doc). */
export type CommentErrorKind =
  /** 404 — publication no longer §4-visible / comment absent or foreign. */
  | "gone"
  /** 409 `COMMUNITY_COMMENT_STATE_INVALID` — edit against a non-VISIBLE comment. */
  | "stateInvalid"
  /** 400 `COMMUNITY_VALIDATION_ERROR` — body bounds. */
  | "validation"
  /** 401 — session expired at AuthN after the single-flight refresh retry. */
  | "unauthenticated"
  /** 429 — §5 comment-write window (see `retryAfterSeconds`). */
  | "rateLimited"
  /** Request sent, no response — safe to retry. */
  | "network"
  /** Anything else. */
  | "other";

/** {@link classifyCommentError} result. */
export interface CommentErrorClassification {
  kind: CommentErrorKind;
  /**
   * `Retry-After` on 429, in whole seconds. `null` when absent/unparseable
   * or the failure is not a 429.
   */
  retryAfterSeconds: number | null;
}

/** Reduce any thrown value to a {@link CommentErrorClassification}. Never throws. */
export function classifyCommentError(err: unknown): CommentErrorClassification {
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
    case 400:
      if (norm.code === "COMMUNITY_VALIDATION_ERROR") {
        return { kind: "validation", retryAfterSeconds: null };
      }
      return none;
    case 409:
      if (norm.code === "COMMUNITY_COMMENT_STATE_INVALID") {
        return { kind: "stateInvalid", retryAfterSeconds: null };
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
