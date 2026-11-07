import { http } from "./http-client";

/**
 * Owner + moderation Community API (P3, issue #44 — ADR-006 §7 frozen contract).
 * Every route here is authenticated (`/api/community/**`); failures reject as
 * `NormalizedApiError` via the axios layer. §7 auth matrix in short:
 *
 * - STUDENT on owner routes        → 403 `COMMUNITY_ACCESS_DENIED`
 * - foreign publication id         → 404 (anti-enumeration, never 403)
 * - disabled/LOCKED/PENDING/unverified → 401 at AuthN (they cannot log in)
 * - moderation without the grant   → 403 `COMMUNITY_ACCESS_DENIED`
 *
 * Owner DTO allowlist (§7): the public card fields PLUS `examId, status,
 * moderationState, reusePolicy, version, openReportCount, createdAt,
 * updatedAt, publishedAt, authorAlias`. Still never any answer material,
 * username, email, or phone ever.
 */

/** §3 `community_publications.status`. */
export type CommunityPublicationStatus = "UNPUBLISHED" | "PUBLISHED";

/** §3 `community_publications.moderation_state`. */
export type CommunityModerationState = "VISIBLE" | "HIDDEN";

/** §3 `reuse_policy` — NO_FORK is the default; ALLOW_FORK is explicit consent. */
export type CommunityReusePolicy = "NO_FORK" | "ALLOW_FORK";

/** §3 `community_reports.reason_code` allowlist. */
export type CommunityReportReasonCode =
  | "INAPPROPRIATE_CONTENT"
  | "COPYRIGHT"
  | "MISLEADING"
  | "SPAM"
  | "OTHER";

/** §3 `community_reports.status`. */
export type CommunityReportStatus = "OPEN" | "DISMISSED" | "RESOLVED";

/** §3 `community_moderation_actions.action` (publication-scoped rows only). */
export type ModerationAuditAction =
  | "HIDE"
  | "RESTORE"
  | "REPORT_DISMISS"
  | "REPORT_RESOLVE";

/**
 * §7 Owner DTO — `PublicPublicationCard` + owner-only fields. `authorName`
 * is the public alias projection (never `display_name`); `publishedAt` is
 * null while UNPUBLISHED.
 */
export interface OwnerPublication {
  publicationId: number;
  title: string;
  summary: string | null;
  authorName: string | null;
  categoryCode: string | null;
  categoryTitle: string | null;
  tags: string[];
  questionCount: number;
  sectionCount: number;
  durationMinutes: number;
  publishedAt: string | null;
  allowFork: boolean;
  // Owner additions (§7 "Owner DTO adds …").
  examId: number;
  status: CommunityPublicationStatus;
  moderationState: CommunityModerationState;
  reusePolicy: CommunityReusePolicy;
  version: number;
  /** OPEN reports only — no reporter data ever. */
  openReportCount: number;
  createdAt: string;
  updatedAt: string;
  authorAlias: string | null;
}

/** `POST /api/community/publications` body (§4 create). */
export interface CreateCommunityPublicationRequest {
  examId: number;
  title: string;
  summary?: string;
  categoryId?: number;
  tags?: string[];
  /** Optional at create; the FE publish flow always sends it (required at publish). */
  authorAlias?: string;
  reusePolicy?: CommunityReusePolicy;
}

/**
 * `PATCH /api/community/publications/{id}` body — the PATCHable set is
 * exactly `{title, summary, categoryId, tags, authorAlias, reusePolicy}` and
 * `expectedVersion` is required (§4): a mismatch → 409
 * `COMMUNITY_CONCURRENT_MODIFICATION`.
 */
export interface UpdateCommunityPublicationRequest {
  title?: string;
  summary?: string | null;
  categoryId?: number | null;
  tags?: string[];
  authorAlias?: string;
  reusePolicy?: CommunityReusePolicy;
  expectedVersion: number;
}

/** Owner list params — 0-based page, fixed `created_at DESC, id DESC` order server-side. */
export interface OwnerPublicationListParams {
  /** 0-based page index. */
  page?: number;
  /** Clamped to [1, 50]. */
  size?: number;
}

/** `PageResponse` envelope for the owner list (0-based page/size). */
export interface OwnerPublicationPage {
  items: OwnerPublication[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Owner list page size bounds (the backend PageResponse clamps too). */
export const MAX_OWNER_PAGE_SIZE = 50;
/** Page size used by the /community/mine owner console. */
export const DEFAULT_OWNER_PAGE_SIZE = 10;

/**
 * `GET /api/community/me/publications?page&size` — own rows as a paged
 * envelope, `created_at DESC, id DESC` (§3 index).
 */
export function listMyPublications(
  params: OwnerPublicationListParams = {}
): Promise<OwnerPublicationPage> {
  const size = Math.min(
    Math.max(1, params.size ?? DEFAULT_OWNER_PAGE_SIZE),
    MAX_OWNER_PAGE_SIZE
  );
  return http.get<OwnerPublicationPage>("/api/community/me/publications", {
    params: {
      page: Math.max(0, params.page ?? 0),
      size,
    },
  });
}

/**
 * `POST /api/community/publications` — creates the (UNPUBLISHED, VISIBLE)
 * row for a PUBLISHED exam the caller owns. Duplicate publication for the
 * same exam → 409 `COMMUNITY_PUBLICATION_EXISTS`.
 */
export function createCommunityPublication(
  req: CreateCommunityPublicationRequest
): Promise<OwnerPublication> {
  return http.post<OwnerPublication>("/api/community/publications", req);
}

/**
 * `PATCH /api/community/publications/{id}` — owner only; foreign id → 404.
 * `expectedVersion` mismatch → 409 `COMMUNITY_CONCURRENT_MODIFICATION`.
 */
export function updateCommunityPublication(
  publicationId: number,
  req: UpdateCommunityPublicationRequest
): Promise<OwnerPublication> {
  return http.patch<OwnerPublication>(
    `/api/community/publications/${publicationId}`,
    req
  );
}

/**
 * `POST /api/community/publications/{id}/publish` — UNPUBLISHED→PUBLISHED.
 * Already PUBLISHED + VISIBLE → 200 idempotent no-op. Any HIDDEN state → 409
 * `COMMUNITY_MODERATION_HIDDEN`; missing alias → 409 `COMMUNITY_ALIAS_REQUIRED`;
 * eligibility lost → 409 `COMMUNITY_PUBLISH_INELIGIBLE`.
 */
export function publishCommunityPublication(
  publicationId: number
): Promise<OwnerPublication> {
  return http.post<OwnerPublication>(
    `/api/community/publications/${publicationId}/publish`
  );
}

/** `POST /api/community/publications/{id}/unpublish` — PUBLISHED→UNPUBLISHED, idempotent no-op. */
export function unpublishCommunityPublication(
  publicationId: number
): Promise<OwnerPublication> {
  return http.post<OwnerPublication>(
    `/api/community/publications/${publicationId}/unpublish`
  );
}

/* ------------------------------------------------------------------ */
/* Moderation (§5/§7) — effective COMMUNITY_MODERATION required.       */
/* ------------------------------------------------------------------ */

/** `GET /api/community/moderation/grant` — 200 `{granted:true}` with grant, 403 without. */
export interface ModerationGrant {
  granted: boolean;
}

/** `GET /api/community/moderation/grant` — the FE console gate (§7). */
export function getModerationGrant(): Promise<ModerationGrant> {
  return http.get<ModerationGrant>("/api/community/moderation/grant");
}

/** Queue list params — 0-based page, fixed `created_at` order server-side. */
export interface ModerationReportListParams {
  status?: CommunityReportStatus;
  page?: number;
  size?: number;
}

/**
 * Publication summary embedded in a queue item — the §7 public card fields
 * only (no answers, no ids beyond `publicationId`, no PII).
 */
export interface ModerationPublicationSummary {
  title: string;
  authorName: string | null;
  categoryCode: string | null;
  categoryTitle: string | null;
  questionCount: number;
  sectionCount: number;
  durationMinutes: number;
}

/** One queue item from `GET /api/community/moderation/reports`. */
export interface ModerationReportItem {
  id: number;
  reasonCode: CommunityReportReasonCode;
  details: string | null;
  status: CommunityReportStatus;
  createdAt: string;
  publicationId: number;
  publication: ModerationPublicationSummary;
}

/** `PageResponse` envelope for the moderation queue (0-based page/size). */
export interface ModerationReportPage {
  items: ModerationReportItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Queue page size bounds. */
export const MAX_MODERATION_PAGE_SIZE = 50;
/** Page size used by the moderation console. */
export const DEFAULT_MODERATION_PAGE_SIZE = 10;

/** `GET /api/community/moderation/reports?status&page&size` — moderator only (403 otherwise). */
export function listModerationReports(
  params: ModerationReportListParams = {}
): Promise<ModerationReportPage> {
  const size = Math.min(
    Math.max(1, params.size ?? DEFAULT_MODERATION_PAGE_SIZE),
    MAX_MODERATION_PAGE_SIZE
  );
  return http.get<ModerationReportPage>("/api/community/moderation/reports", {
    params: {
      status: params.status ?? undefined,
      page: Math.max(0, params.page ?? 0),
      size,
    },
  });
}

/**
 * `POST /api/community/moderation/publications/{id}/hide` — VISIBLE→HIDDEN,
 * mandatory reason. Already HIDDEN → 200 no-op (no duplicate audit row).
 */
export function hidePublication(
  publicationId: number,
  reason: string
): Promise<void> {
  return http.post<void>(
    `/api/community/moderation/publications/${publicationId}/hide`,
    { reason }
  );
}

/**
 * `POST /api/community/moderation/publications/{id}/restore` — HIDDEN→VISIBLE,
 * mandatory reason. Does NOT change publish status (§4).
 */
export function restorePublication(
  publicationId: number,
  reason: string
): Promise<void> {
  return http.post<void>(
    `/api/community/moderation/publications/${publicationId}/restore`,
    { reason }
  );
}

/**
 * `POST /api/community/moderation/reports/{id}/dismiss` — optional note.
 * Returns the updated queue-item shape.
 */
export function dismissReport(
  reportId: number,
  note?: string
): Promise<ModerationReportItem> {
  return http.post<ModerationReportItem>(
    `/api/community/moderation/reports/${reportId}/dismiss`,
    note ? { note } : {}
  );
}

/** `POST /api/community/moderation/reports/{id}/resolve` — optional note. */
export function resolveReport(
  reportId: number,
  note?: string
): Promise<ModerationReportItem> {
  return http.post<ModerationReportItem>(
    `/api/community/moderation/reports/${reportId}/resolve`,
    note ? { note } : {}
  );
}

/**
 * One append-only audit row (§3 `community_moderation_actions`). Actor is an
 * internal user id only — an intentional, audited moderator privilege (§5);
 * no username/email/phone ever.
 */
export interface ModerationAuditEntry {
  id: number;
  action: ModerationAuditAction;
  fromStatus: CommunityPublicationStatus | null;
  toStatus: CommunityPublicationStatus | null;
  fromModerationState: CommunityModerationState | null;
  toModerationState: CommunityModerationState | null;
  reason: string;
  createdAt: string;
  actorUserId: number;
}

/**
 * `GET /api/community/moderation/publications/{id}/history` — audit rows,
 * `created_at DESC` server-side; the FE renders read-only, newest-first.
 */
export function getPublicationHistory(
  publicationId: number
): Promise<ModerationAuditEntry[]> {
  return http.get<ModerationAuditEntry[]>(
    `/api/community/moderation/publications/${publicationId}/history`
  );
}
