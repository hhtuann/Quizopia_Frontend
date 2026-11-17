import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import {
  buildParticipantsParams,
  DEFAULT_PARTICIPANTS_FILTERS,
  getMonitoringOverview,
  getMonitoringParticipants,
} from "./monitoring-dashboard";

/**
 * P4-E dashboard API (design §3.1/§3.2): endpoints + the pure param builder
 * that drops `"ALL"` filter sentinels — against a mocked httpClient.
 */

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(http.get);

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(undefined as never);
});

describe("getMonitoringOverview (GET §3.1)", () => {
  it("reads the session overview endpoint", async () => {
    await getMonitoringOverview(5);
    expect(get).toHaveBeenCalledWith("/api/exam-sessions/5/monitoring/overview");
  });
});

describe("buildParticipantsParams (pure)", () => {
  it("drops ALL sentinels and omits absent paging params", () => {
    expect(buildParticipantsParams(DEFAULT_PARTICIPANTS_FILTERS)).toEqual({});
  });

  it("keeps concrete filter values, cursor and limit", () => {
    expect(
      buildParticipantsParams(
        { status: "SUBMITTED", cameraState: "RECONNECTING", reviewStatus: "UNREVIEWED" },
        7,
        50
      )
    ).toEqual({
      status: "SUBMITTED",
      cameraState: "RECONNECTING",
      reviewStatus: "UNREVIEWED",
      cursor: "7",
      limit: "50",
    });
  });

  it("mixes a single concrete filter with ALL sentinels", () => {
    expect(
      buildParticipantsParams({ ...DEFAULT_PARTICIPANTS_FILTERS, cameraState: "NONE" })
    ).toEqual({ cameraState: "NONE" });
  });
});

describe("getMonitoringParticipants (GET §3.2)", () => {
  it("calls the bare endpoint when nothing is filtered", async () => {
    await getMonitoringParticipants(5);
    expect(get).toHaveBeenCalledWith(
      "/api/exam-sessions/5/monitoring/participants"
    );
  });

  it("appends filters and the cursor as query params", async () => {
    await getMonitoringParticipants(
      5,
      { status: "IN_PROGRESS", cameraState: "ALL", reviewStatus: "NOTED" },
      "7",
      25
    );
    expect(get).toHaveBeenCalledWith(
      "/api/exam-sessions/5/monitoring/participants?cursor=7&limit=25&status=IN_PROGRESS&reviewStatus=NOTED"
    );
  });
});
