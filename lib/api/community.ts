import { http } from "./http-client";

/**
 * Public Community API + types (P3, issue #43 — ADR-006 §7 frozen contract).
 *
 * Anonymous, read-only discovery surface. Every type below mirrors the backend
 * DTO allowlist field-for-field. NOTHING here may carry answer material
 * (`answerKey`, `isCorrect`, option content), internal exam/question ids, or
 * PII (username/email/phone/publisher user id/display_name) — `authorName` is
 * the author's explicitly acknowledged public alias ONLY.
 *
 * Endpoints (public, GET-only, `Cache-Control: no-store` from the backend):
 *   - GET /api/public/community/publications?q&categoryId&tags&page&size
 *   - GET /api/public/community/publications/{id}
 *   - GET /api/public/community/categories
 *   - GET /api/public/community/tags
 *
 * Errors flow through the shared axios interceptor as `NormalizedApiError`
 * (e.g. an absent/hidden/unpublished publication detail → `{ kind: "api",
 * status: 404 }` — anti-enumeration, never a reason string).
 */

/** Backend record `PublicPublicationCard` — the exact §7 allowlist, nothing else. */
export interface PublicPublicationCard {
  publicationId: number;
  title: string;
  summary: string | null;
  /** Public credit alias — NEVER the publisher's display name / username / email. */
  authorName: string;
  /** Null when the publication carries no category (category is optional). */
  categoryCode: string | null;
  categoryTitle: string | null;
  /** ≤5 labels, lower-cased by the server. */
  tags: string[];
  questionCount: number;
  sectionCount: number;
  durationMinutes: number;
  publishedAt: string;
  allowFork: boolean;
}

/** Backend record `PublicPublicationDetail` = card + `updatedAt`. */
export interface PublicPublicationDetail extends PublicPublicationCard {
  updatedAt: string;
}

/**
 * Backend `PublicPublicationPage`. Same envelope as the question module's
 * `PageResponse` minus `sort` (the public catalog has a fixed
 * `publishedAt DESC, id DESC` order and exposes no sort parameter).
 */
export interface PublicPublicationPage {
  items: PublicPublicationCard[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Backend record `PublicCategoryDto` — `{id, code, title}`.
 *
 * Pinned by the lead (ADR-006 Rev 4, 2026-11-08): the §7 list filter key is
 * `categoryId`, so the categories response carries the id alongside code/title
 * (a literal `[{code,title}]` would make the filter unusable — no public
 * code→id mapping exists). Taxonomy ids are public catalog identity (platform
 * precedent: `/api/exam-purposes` exposes id+code+title) and are not on §7's
 * forbidden allowlist. Backend #41 implements the same frozen shape.
 */
export interface PublicCommunityCategory {
  id: number;
  code: string;
  title: string;
}

/** Backend record `PublicTagDto` — `label` + usage count over §4-visible publications only. */
export interface PublicCommunityTag {
  label: string;
  usageCount: number;
}

/** Catalog page size bounds (§7: `size` ≤ 50). */
export const MAX_PUBLIC_PAGE_SIZE = 50;
/** Page size used by the explore grid. */
export const DEFAULT_PUBLIC_PAGE_SIZE = 12;

export interface PublicPublicationListParams {
  /** Free-text search over title/summary (server-side; trimmed here). */
  q?: string;
  /** Category filter — a `PublicCommunityCategory.id`. */
  categoryId?: number;
  /** Tag filter — AND semantics server-side (one EXISTS probe per tag). */
  tags?: string[];
  /** 0-based page index. */
  page?: number;
  /** Clamped to [1, 50]. */
  size?: number;
}

/**
 * `GET /api/public/community/publications` — public, anonymous catalog.
 *
 * `tags` is serialized comma-joined (`tags=a,b`): Spring's default `List<String>`
 * binding accepts the comma form and the repeated form, but NOT axios's default
 * bracket form (`tags[]=a`). Tag labels match `[a-z0-9][a-z0-9 -]{0,39}` — no
 * commas — so the join is unambiguous.
 */
export function listPublicPublications(
  params: PublicPublicationListParams = {}
): Promise<PublicPublicationPage> {
  const tags = (params.tags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  const size = Math.min(
    Math.max(1, params.size ?? DEFAULT_PUBLIC_PAGE_SIZE),
    MAX_PUBLIC_PAGE_SIZE
  );
  return http.get<PublicPublicationPage>("/api/public/community/publications", {
    params: {
      q: params.q?.trim() || undefined,
      categoryId: params.categoryId ?? undefined,
      tags: tags.length > 0 ? tags.join(",") : undefined,
      page: Math.max(0, params.page ?? 0),
      size,
    },
  });
}

/**
 * `GET /api/public/community/publications/{id}` — public detail, or 404
 * (absent/unpublished/hidden → anti-enumeration, no reason string).
 */
export function getPublicPublication(
  publicationId: number
): Promise<PublicPublicationDetail> {
  return http.get<PublicPublicationDetail>(
    `/api/public/community/publications/${publicationId}`
  );
}

/** `GET /api/public/community/categories` — migration-managed catalog, never mutates. */
export function listPublicCategories(): Promise<PublicCommunityCategory[]> {
  return http.get<PublicCommunityCategory[]>("/api/public/community/categories");
}

/** `GET /api/public/community/tags` — top 100 labels with visible-only usage counts. */
export function listPublicTags(): Promise<PublicCommunityTag[]> {
  return http.get<PublicCommunityTag[]>("/api/public/community/tags");
}
