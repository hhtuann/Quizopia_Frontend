import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import type { NormalizedApiError } from "./errors";
import {
  classifySocialError,
  deleteLike,
  deleteRating,
  getPublicSocialSummary,
  getSocialSummary,
  putLike,
  putRating,
} from "./community-social";

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const get = vi.mocked(http.get);
const put = vi.mocked(http.put);
const del = vi.mocked(http.delete);

beforeEach(() => {
  get.mockReset();
  put.mockReset();
  del.mockReset();
  get.mockResolvedValue(undefined as never);
  put.mockResolvedValue(undefined as never);
  del.mockResolvedValue(undefined as never);
});

function apiError(
  status: number,
  code: string,
  raw: unknown = {}
): NormalizedApiError {
  return { kind: "api", status, code, message: "msg", raw };
}

describe("community social API (ADR-007 §5)", () => {
  it("targets the frozen public/authenticated summary routes", async () => {
    await getPublicSocialSummary(7);
    await getSocialSummary(7);

    expect(get).toHaveBeenCalledWith(
      "/api/public/community/publications/7/social-summary"
    );
    expect(get).toHaveBeenCalledWith(
      "/api/community/publications/7/social-summary"
    );
  });

  it("targets the frozen like/rating routes with the rating body", async () => {
    await putLike(7);
    await deleteLike(7);
    await putRating(7, 4);
    await deleteRating(7);

    expect(put).toHaveBeenCalledWith("/api/community/publications/7/like");
    expect(del).toHaveBeenCalledWith("/api/community/publications/7/like");
    expect(put).toHaveBeenCalledWith("/api/community/publications/7/rating", {
      rating: 4,
    });
    expect(del).toHaveBeenCalledWith("/api/community/publications/7/rating");
  });

  it("classifies 404/401/429/network/other distinctly", () => {
    expect(classifySocialError(apiError(404, "COMMUNITY_NOT_FOUND"))).toEqual({
      kind: "gone",
      retryAfterSeconds: null,
    });
    expect(classifySocialError(apiError(401, "AUTH_ACCESS_DENIED"))).toEqual({
      kind: "unauthenticated",
      retryAfterSeconds: null,
    });
    expect(classifySocialError(apiError(429, "COMMUNITY_RATE_LIMITED"))).toEqual(
      { kind: "rateLimited", retryAfterSeconds: null }
    );
    expect(classifySocialError({ kind: "network", message: "x", raw: {} })).toEqual(
      { kind: "network", retryAfterSeconds: null }
    );
    expect(classifySocialError(apiError(500, "INTERNAL_ERROR"))).toEqual({
      kind: "other",
      retryAfterSeconds: null,
    });
    expect(classifySocialError(undefined)).toEqual({
      kind: "other",
      retryAfterSeconds: null,
    });
  });

  it("classifies the publisher self-rating 409 as selfRating", () => {
    expect(
      classifySocialError(apiError(409, "COMMUNITY_SELF_RATING_NOT_ALLOWED"))
    ).toEqual({ kind: "selfRating", retryAfterSeconds: null });
    // Any other 409 is just "other".
    expect(classifySocialError(apiError(409, "SOMETHING_ELSE"))).toEqual({
      kind: "other",
      retryAfterSeconds: null,
    });
  });

  it("parses Retry-After (delta-seconds and HTTP-date) on 429", () => {
    const withHeader = (header: unknown): NormalizedApiError =>
      ({
        kind: "api",
        status: 429,
        code: "COMMUNITY_RATE_LIMITED",
        message: "msg",
        raw: {
          isAxiosError: true,
          response: { headers: { "retry-after": header } },
        },
      }) as unknown as NormalizedApiError;

    expect(classifySocialError(withHeader("30"))).toEqual({
      kind: "rateLimited",
      retryAfterSeconds: 30,
    });

    const future = new Date(Date.now() + 90_000).toUTCString();
    const parsed = classifySocialError(withHeader(future));
    expect(parsed.kind).toBe("rateLimited");
    expect(parsed.retryAfterSeconds).toBeGreaterThanOrEqual(89);
    expect(parsed.retryAfterSeconds).toBeLessThanOrEqual(91);

    expect(classifySocialError(withHeader("not-a-date"))).toEqual({
      kind: "rateLimited",
      retryAfterSeconds: null,
    });
  });
});
