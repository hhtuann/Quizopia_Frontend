import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  buildTimelineParams,
  getAnswerHistory,
  getAttemptTimeline,
  ingestActivityEvents,
  retryAfterSeconds,
  type ActivityEventInput,
} from "./monitoring";

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

describe("monitoring API routes (P4-A frozen contract)", () => {
  it("ingest posts the batch verbatim to /activity-events", async () => {
    const events: ActivityEventInput[] = [
      {
        eventId: "id-1",
        eventType: "TAB_HIDDEN",
        clientOccurredAt: "2026-07-10T08:00:00Z",
        clientSequence: 0,
      },
    ];
    await ingestActivityEvents(12, events);
    expect(post).toHaveBeenCalledWith("/api/attempts/12/activity-events", {
      events,
    });
  });

  it("timeline targets the cursor route with built params", async () => {
    await getAttemptTimeline(12, { cursor: "abc", limit: 25, source: "CLIENT" });
    expect(get).toHaveBeenCalledWith("/api/attempts/12/timeline", {
      params: { cursor: "abc", limit: "25", source: "CLIENT" },
    });
  });

  it("answer-history passes the optional question filter only when set", async () => {
    await getAnswerHistory(12);
    expect(get).toHaveBeenCalledWith("/api/attempts/12/answer-history", {
      params: undefined,
    });
    await getAnswerHistory(12, 34);
    expect(get).toHaveBeenLastCalledWith("/api/attempts/12/answer-history", {
      params: { attemptQuestionId: 34 },
    });
  });
});

describe("buildTimelineParams", () => {
  it("omits empty values so axios drops them", () => {
    expect(buildTimelineParams()).toEqual({});
    expect(
      buildTimelineParams({ cursor: undefined, types: [], source: undefined })
    ).toEqual({});
  });

  it("joins the comma-separated types list, filtering blanks", () => {
    expect(
      buildTimelineParams({ types: ["TAB_HIDDEN", "", "TAB_VISIBLE"] })
    ).toEqual({ types: "TAB_HIDDEN,TAB_VISIBLE" });
  });

  it("clamps limit into the 1..100 server window", () => {
    expect(buildTimelineParams({ limit: 0 })).toEqual({ limit: "1" });
    expect(buildTimelineParams({ limit: 500 })).toEqual({ limit: "100" });
    expect(buildTimelineParams({ limit: 50.6 })).toEqual({ limit: "51" });
    expect(buildTimelineParams({ limit: Number.NaN })).toEqual({});
  });

  it("passes from/to ISO bounds and source through", () => {
    expect(
      buildTimelineParams({
        source: "SERVER",
        from: "2026-07-10T00:00:00Z",
        to: "2026-07-10T23:59:59Z",
      })
    ).toEqual({
      source: "SERVER",
      from: "2026-07-10T00:00:00Z",
      to: "2026-07-10T23:59:59Z",
    });
  });
});

describe("retryAfterSeconds", () => {
  it("parses the Retry-After header off the raw axios error", () => {
    expect(
      retryAfterSeconds({
        kind: "api",
        status: 429,
        code: "MONITORING_RATE_LIMITED",
        message: "",
        raw: {
          isAxiosError: true,
          response: { headers: { "retry-after": "7" } },
        },
      })
    ).toBe(7);
  });

  it("returns null when absent, unparseable, or non-numeric", () => {
    expect(retryAfterSeconds({ kind: "api", status: 429, code: "X", message: "", raw: {} })).toBeNull();
    expect(
      retryAfterSeconds({
        kind: "api",
        status: 429,
        code: "X",
        message: "",
        raw: { isAxiosError: true, response: { headers: { "retry-after": "soon" } } },
      })
    ).toBeNull();
    expect(retryAfterSeconds(undefined)).toBeNull();
  });
});
