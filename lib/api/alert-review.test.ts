import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  getAlertReviews,
  isReviewVersionConflict,
  newIdempotencyKey,
  reviewConflictMessage,
  submitAlertReview,
} from "./alert-review";

/**
 * P4-E alert review API (design §3.3/§3.4): endpoint + Idempotency-Key
 * header wiring, error narrowing for the 409 version conflict, and key
 * generation — against a mocked httpClient (no network in vitest).
 */

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(http.get);
const post = vi.mocked(http.post);

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue(undefined as never);
  post.mockResolvedValue(undefined as never);
});

describe("submitAlertReview (POST §3.3)", () => {
  it("posts the optimistic-version body with a fresh Idempotency-Key header", async () => {
    await submitAlertReview(
      9,
      { expectedVersion: 0, action: "FALSE_POSITIVE", note: "ghi chú" },
      "0e2d1a1c-0000-4000-8000-000000000000"
    );
    expect(post).toHaveBeenCalledWith(
      "/api/monitoring/alerts/9/reviews",
      { expectedVersion: 0, action: "FALSE_POSITIVE", note: "ghi chú" },
      { headers: { "Idempotency-Key": "0e2d1a1c-0000-4000-8000-000000000000" } }
    );
  });

  it("omits the note key when no note is given (never note: undefined on the wire)", async () => {
    await submitAlertReview(9, { expectedVersion: 2, action: "NOTED" }, "k");
    expect(post).toHaveBeenCalledWith(
      "/api/monitoring/alerts/9/reviews",
      { expectedVersion: 2, action: "NOTED" },
      { headers: { "Idempotency-Key": "k" } }
    );
  });
});

describe("getAlertReviews (GET §3.4)", () => {
  it("reads the review history endpoint", async () => {
    await getAlertReviews(9);
    expect(get).toHaveBeenCalledWith("/api/monitoring/alerts/9/reviews");
  });
});

describe("version-conflict detection", () => {
  const conflict = {
    kind: "api",
    status: 409,
    code: "MONITORING_REVIEW_VERSION_CONFLICT",
    message: "Alert already reviewed (current version 3)",
    raw: null,
  };

  it("recognizes the 409 api error", () => {
    expect(isReviewVersionConflict(conflict)).toBe(true);
  });

  it("rejects other api codes, http and network errors", () => {
    expect(isReviewVersionConflict({ ...conflict, code: "OTHER" })).toBe(false);
    expect(isReviewVersionConflict({ kind: "http", status: 409, message: "", raw: null })).toBe(false);
    expect(isReviewVersionConflict({ kind: "network", message: "", raw: null })).toBe(false);
    expect(isReviewVersionConflict(null)).toBe(false);
  });

  it("extracts the server message (which carries the current version)", () => {
    expect(reviewConflictMessage(conflict)).toBe(
      "Alert already reviewed (current version 3)"
    );
    expect(
      reviewConflictMessage({ kind: "network", message: "offline", raw: null })
    ).toBeNull();
  });
});

describe("newIdempotencyKey", () => {
  it("yields a distinct key per call (per-intent identity)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(newIdempotencyKey());
    expect(seen.size).toBe(100);
  });
});
