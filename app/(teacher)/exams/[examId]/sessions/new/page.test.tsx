// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { describeCreateError } from "./page";
import type { NormalizedApiError } from "@/lib/api";

/**
 * FE-6 regression: the create-error mapper must keep its pre-existing
 * branches (code conflict, time window → endsAt field, validation error)
 * alongside the new monitoring cases.
 */

function apiError(code: string): NormalizedApiError {
  return { kind: "api", status: 400, code, message: `msg:${code}`, raw: {} };
}

describe("describeCreateError (FE-6: no lost branches)", () => {
  it("maps EXAM_CODE_CONFLICT to a retry hint", () => {
    expect(describeCreateError(apiError("EXAM_CODE_CONFLICT")).message).toMatch(
      /already in use/i
    );
  });

  it("maps EXAM_SESSION_TIME_INVALID onto the endsAt field", () => {
    expect(describeCreateError(apiError("EXAM_SESSION_TIME_INVALID"))).toEqual({
      field: "endsAt",
      message: "End time must be after the start time.",
    });
  });

  it("surfaces EXAM_VALIDATION_ERROR copy from the server", () => {
    expect(describeCreateError(apiError("EXAM_VALIDATION_ERROR")).message).toBe(
      "msg:EXAM_VALIDATION_ERROR"
    );
  });

  it("keeps the monitoring cases", () => {
    expect(
      describeCreateError(apiError("EXAM_SESSION_MONITORING_INVALID")).message
    ).toMatch(/class-restricted session/i);
    expect(describeCreateError(apiError("EXAM_SESSION_MONITORING_FROZEN")).message).toMatch(
      /locked/i
    );
  });

  it("keeps permission/not-found/publish cases and fallbacks", () => {
    expect(describeCreateError(apiError("EXAM_SESSION_NOT_PUBLISHED_EXAM")).message).toMatch(
      /publish/i
    );
    expect(describeCreateError(apiError("EXAM_NOT_FOUND")).message).toMatch(/could not be found/i);
    expect(describeCreateError(apiError("EXAM_SESSION_ACCESS_DENIED")).message).toMatch(
      /permission/i
    );
    expect(describeCreateError({ kind: "network", message: "x", raw: {} }).message).toMatch(
      /network/i
    );
    expect(describeCreateError(undefined).message).toMatch(/something went wrong/i);
  });
});
