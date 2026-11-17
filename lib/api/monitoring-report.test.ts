import { beforeEach, describe, expect, it, vi } from "vitest";
import { http } from "./http-client";
import { getAttemptMonitoringReport } from "./monitoring-report";

/**
 * P4-E report API (design §3.6): the single read-time aggregation endpoint —
 * against a mocked httpClient.
 */

vi.mock("./http-client", () => ({
  http: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(http.get);

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(undefined as never);
});

describe("getAttemptMonitoringReport", () => {
  it("reads the attempt monitoring report endpoint", async () => {
    await getAttemptMonitoringReport(7);
    expect(get).toHaveBeenCalledWith("/api/attempts/7/monitoring/report");
  });
});
