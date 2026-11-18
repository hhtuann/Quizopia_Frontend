import { http } from "./http-client";

/**
 * AI-assisted Quiz Markdown authoring API + types (Phase 5, issue #114).
 *
 * Types mirror the backend contract field-for-field:
 *   - GET  /api/question-banks/{bankId}/ai/authoring          → AiAuthoringStatus
 *   - POST /api/question-banks/{bankId}/ai/documents/extract  → AiExtractedDocument (multipart "file")
 *   - POST /api/question-banks/{bankId}/ai/author             → AiAuthorResponse (JSON)
 *
 * The status endpoint is teacher-only: a 403 for non-owners arrives as the
 * standard ApiError body — callers treat ANY error as "unavailable".
 * Provider failures (429 / 5xx / timeout) reject as NormalizedApiError like
 * every other endpoint in this client.
 */

/** `GET …/ai/authoring` — server-side capability probe (never leaks keys). */
export interface AiAuthoringStatus {
  readonly enabled: boolean;
  readonly available: boolean;
  readonly model: string;
}

/** `POST …/ai/documents/extract` — extracted plain text for one uploaded file. */
export interface AiExtractedDocument {
  readonly name: string;
  readonly text: string;
  readonly truncated: boolean;
  readonly charCount: number;
}

/** A document attached to an author request (name + extracted text only). */
export interface AiAuthorDocument {
  readonly name: string;
  readonly text: string;
}

/** One prior chat turn sent back with each author request. */
export interface AiAuthorMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** `POST …/ai/author` request body. */
export interface AiAuthorRequest {
  readonly instruction: string;
  readonly currentMarkdown: string;
  readonly documents: readonly AiAuthorDocument[];
  readonly history: readonly AiAuthorMessage[];
}

/** Authoritative parser finding for the candidate Markdown. */
export interface AiAuthorDiagnostic {
  readonly code: string;
  readonly questionNumber: number | null;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** `POST …/ai/author` response: candidate Markdown + assistant reply. */
export interface AiAuthorResponse {
  readonly markdown: string;
  readonly reply: string;
  readonly valid: boolean;
  readonly diagnostics: readonly AiAuthorDiagnostic[];
}

/**
 * `GET /api/question-banks/{bankId}/ai/authoring` — availability probe.
 * Errors (including 403 for non-owners) reject; callers map any failure to
 * "unavailable".
 */
export function getAiAuthoringStatus(bankId: number): Promise<AiAuthoringStatus> {
  return http.get<AiAuthoringStatus>(`/api/question-banks/${bankId}/ai/authoring`);
}

/**
 * `POST /api/question-banks/{bankId}/ai/documents/extract` (multipart/form-data).
 * The part name MUST be `file` (backend `@RequestPart("file")`). Do NOT set
 * `Content-Type` manually — axios sets the multipart boundary automatically
 * when the body is a `FormData`. Server-side cap is 5 MiB; the UI pre-checks
 * the same limit client-side for instant feedback.
 */
export function extractAiDocument(bankId: number, file: File): Promise<AiExtractedDocument> {
  const form = new FormData();
  form.append("file", file);
  return http.post<AiExtractedDocument>(
    `/api/question-banks/${bankId}/ai/documents/extract`,
    form
  );
}

/**
 * `POST /api/question-banks/{bankId}/ai/author` — one authoring turn.
 *
 * The backend blocks for up to its provider timeout (90s) plus one bounded
 * repair pass, so this call must NOT inherit the shared client's 15s
 * default — a real-provider turn regularly exceeds it.
 */
const AUTHOR_TIMEOUT_MS = 195_000;

export function authorAiMarkdown(bankId: number, request: AiAuthorRequest): Promise<AiAuthorResponse> {
  return http.post<AiAuthorResponse>(
    `/api/question-banks/${bankId}/ai/author`,
    request,
    { timeout: AUTHOR_TIMEOUT_MS },
  );
}
