import { describe, expect, it } from "vitest";
import { formatDateTime, formatTime } from "@/lib/utils/format";

/**
 * Shared date/time formatting (P4-E): the exact en-GB pattern the monitoring
 * surfaces use, with the NaN/absence → "—" honesty guard.
 */

describe("formatTime", () => {
  it("renders HH:mm:ss (en-GB, 24h)", () => {
    expect(formatTime("2026-11-17T08:05:09Z")).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("guards invalid and absent instants with —", () => {
    expect(formatTime("not-a-date")).toBe("—");
    expect(formatTime(null)).toBe("—");
    expect(formatTime(undefined)).toBe("—");
    expect(formatTime("")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("renders day month year, HH:mm (en-GB)", () => {
    const value = formatDateTime("2026-11-17T08:05:00Z");
    expect(value).toContain("2026");
    expect(value).toMatch(/\d{2}:\d{2}/);
  });

  it("guards invalid and absent instants with —", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});
