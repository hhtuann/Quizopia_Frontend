import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  classifyForkError,
  forkPublication,
  isValidIdempotencyKey,
  parseRetryAfterSeconds,
} from "./community-fork";

vi.mock("./http-client", () => ({
  http: { post: vi.fn() },
}));

const post = vi.mocked(http.post);

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue(undefined as never);
});

const KEY = "0f1e2d3c-4b5a-6978-8976-a5b4c3d2e1f0";

function apiError(
  status: number,
  code: string,
  headers?: Record<string, unknown>
) {
  return {
    kind: "api" as const,
    status,
    code,
    message: "err",
    raw: { isAxiosError: true, response: { status, headers } },
  };
}

describe("community fork API (ADR-006 §7/§8)", () => {
  it("POSTs the frozen route with the Idempotency-Key header and no body", async () => {
    await forkPublication(7, KEY);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      "/api/community/publications/7/fork",
      undefined,
      { headers: { "Idempotency-Key": KEY } }
    );
  });

  it("fails fast on keys outside the 8–128 printable-ASCII contract", () => {
    expect(() => forkPublication(7, "short")).toThrow(TypeError);
    expect(() => forkPublication(7, "non-printable-\u00e9-key")).toThrow(
      TypeError
    );
    expect(() => forkPublication(7, "x".repeat(129))).toThrow(TypeError);
    expect(post).not.toHaveBeenCalled();

    expect(isValidIdempotencyKey(KEY)).toBe(true);
    expect(isValidIdempotencyKey("8chars!!")).toBe(true);
    expect(isValidIdempotencyKey("7chars!")).toBe(false);
    expect(isValidIdempotencyKey("trailing\n")).toBe(false);
  });

  it("classifies the §7/§8 outcome matrix distinctly", () => {
    expect(
      classifyForkError(apiError(409, "COMMUNITY_IDEMPOTENCY_CONFLICT")).kind
    ).toBe("idempotencyConflict");
    expect(
      classifyForkError(apiError(403, "COMMUNITY_FORK_NOT_ALLOWED")).kind
    ).toBe("forkNotAllowed");
    expect(
      classifyForkError(apiError(403, "COMMUNITY_ACCESS_DENIED")).kind
    ).toBe("other");
    // A generic 409 (none exists today) never masquerades as a key conflict.
    expect(classifyForkError(apiError(409, "SOMETHING_ELSE")).kind).toBe(
      "other"
    );
    expect(classifyForkError(apiError(404, "COMMUNITY_NOT_FOUND")).kind).toBe(
      "gone"
    );
    expect(classifyForkError(apiError(401, "AUTH_ACCESS_DENIED")).kind).toBe(
      "unauthenticated"
    );
    expect(classifyForkError({ kind: "network", message: "x", raw: {} }).kind).toBe(
      "network"
    );
    expect(classifyForkError(apiError(500, "INTERNAL_ERROR")).kind).toBe(
      "other"
    );
    expect(classifyForkError(undefined).kind).toBe("other");
  });

  it("carries Retry-After seconds through the 429 classification", () => {
    const limited = classifyForkError(
      apiError(429, "COMMUNITY_RATE_LIMITED", { "retry-after": "30" })
    );
    expect(limited.kind).toBe("rateLimited");
    expect(limited.retryAfterSeconds).toBe(30);

    // Header-name case + absence tolerated.
    expect(
      classifyForkError(
        apiError(429, "COMMUNITY_RATE_LIMITED", { "Retry-After": "5" })
      ).retryAfterSeconds
    ).toBe(5);
    expect(
      classifyForkError(apiError(429, "COMMUNITY_RATE_LIMITED", {}))
        .retryAfterSeconds
    ).toBeNull();
    // Non-429 failures never report a wait.
    expect(
      classifyForkError(apiError(404, "COMMUNITY_NOT_FOUND", { "retry-after": "9" }))
        .retryAfterSeconds
    ).toBeNull();
  });

  it("parses delta-seconds and HTTP-date Retry-After values only", () => {
    expect(parseRetryAfterSeconds("30")).toBe(30);
    expect(parseRetryAfterSeconds("  7 ")).toBe(7);
    const future = new Date(Date.now() + 90_000).toUTCString();
    expect(parseRetryAfterSeconds(future)).toBeGreaterThan(60);
    expect(parseRetryAfterSeconds(new Date(0).toUTCString())).toBe(0);
    expect(parseRetryAfterSeconds("soon")).toBeNull();
    expect(parseRetryAfterSeconds(undefined)).toBeNull();
    expect(parseRetryAfterSeconds(42)).toBeNull();
  });
});
