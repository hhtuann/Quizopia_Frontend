import { http } from "./http-client";

/**
 * Question Excel import API + types (Day 5, Batch B2 — Teacher-only).
 *
 * Types mirror the backend records field-for-field (verified against):
 *   - com.hhtuann.backend.question.dto.ImportResponse
 *   - com.hhtuann.backend.question.dto.RowError
 *
 * Endpoints (QuestionImportController):
 *   - GET  /api/questions/import-template                 → xlsx blob
 *   - POST /api/question-banks/{bankId}/questions/import  → ImportResponse (multipart "file")
 *   - POST /api/question-banks/{bankId}/questions/import-markdown → ImportResponse (JSON)
 *
 * Partial success: a 200 response may carry `errors[]` (row-level) — these are
 * NOT an ApiError. Only hard pre-conditions (auth / file metadata / structure)
 * return 4xx as ApiError. See Day-5 contract §16/§19.
 */

/** Backend record `RowError(int rowNumber, String questionCode, String field, String code, String message, Integer line, Integer column)`.
 * `line`/`column` carry the authoritative Markdown parser's source position
 * (1-based) for Markdown diagnostics; null for Excel rows and contract
 * findings keyed by question number. */
export interface RowError {
  rowNumber: number;
  questionCode: string | null;
  field: string | null;
  code: string;
  message: string;
  line: number | null;
  column: number | null;
}

/** Backend record `ImportResponse(int totalRows, int importedRows, int invalidRows, List<RowError> errors)`. */
export interface ImportResponse {
  totalRows: number;
  importedRows: number;
  invalidRows: number;
  errors: RowError[];
}

/**
 * `GET /api/questions/import-template` — downloads the xlsx template as a Blob.
 * NOTE: `responseType: "blob"` means an error response's JSON body also arrives
 * as a Blob, so the FE2 normalizer classifies download errors as `kind:"http"`
 * (the ApiError `code` is obscured) — callers map by HTTP status for downloads.
 */
export function downloadImportTemplate(): Promise<Blob> {
  return http.get<Blob>("/api/questions/import-template", {
    responseType: "blob",
  });
}

/**
 * `POST /api/question-banks/{bankId}/questions/import` (multipart/form-data).
 * The part name MUST be `file` (backend `@RequestPart("file")`). Do NOT set
 * `Content-Type` manually — axios sets the multipart boundary automatically
 * when the body is a `FormData`.
 */
export function importQuestions(bankId: number, file: File): Promise<ImportResponse> {
  const form = new FormData();
  form.append("file", file);
  return http.post<ImportResponse>(
    `/api/question-banks/${bankId}/questions/import`,
    form
  );
}
/**
 * `POST /api/question-banks/{bankId}/questions/import-markdown` (P2-C).
 * Teacher-only Quiz Markdown import. The whole document is imported
 * atomically: a 200 response either reports `importedRows === totalRows` with
 * no errors, or `importedRows === 0` with per-question `errors[]` (parse or
 * bank-contract rejections — nothing persisted). Hard pre-conditions (auth,
 * blank/oversized source, too many questions) reject as 4xx ApiError.
 */
export function importMarkdownQuestions(bankId: number, markdown: string): Promise<ImportResponse> {
  return http.post<ImportResponse>(
    `/api/question-banks/${bankId}/questions/import-markdown`,
    { markdown }
  );
}
