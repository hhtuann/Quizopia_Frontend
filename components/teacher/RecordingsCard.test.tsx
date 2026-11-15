// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  RECORDING_GAP_THRESHOLD_MS,
  deriveRecordingGaps,
} from "./RecordingsCard";
import type { RecordingSegment } from "@/lib/api/evidence";

/** P4-D: derived coverage gaps only trust segments the backend could
 * actually serve clip coverage from (mirror of its findCovering):
 * COMPLETE jobs whose object still exists. Deleted or non-COMPLETE rows
 * between two live segments must NOT mask a real gap. */

function segment(
  overrides: Partial<RecordingSegment> = {}
): RecordingSegment {
  return {
    jobId: `job-${Math.random().toString(36).slice(2, 8)}`,
    attemptId: 10,
    kind: "FULL",
    status: "COMPLETE",
    pulseIndex: 0,
    startedAt: "2026-11-15T08:00:00Z",
    endedAt: "2026-11-15T08:01:00Z",
    bytes: 1_000,
    durationMs: 60_000,
    objectDeleted: false,
    ...overrides,
  };
}

describe("deriveRecordingGaps", () => {
  it("contiguous COMPLETE segments (<=2s seam) produce no gaps", () => {
    const gaps = deriveRecordingGaps([
      segment({
        startedAt: "2026-11-15T08:00:00Z",
        endedAt: "2026-11-15T08:01:00Z",
      }),
      segment({
        startedAt: "2026-11-15T08:01:02Z",
        endedAt: "2026-11-15T08:02:00Z",
      }),
    ]);
    expect(gaps).toEqual([]);
  });

  it("a real hole between live segments is reported in seconds", () => {
    const gaps = deriveRecordingGaps([
      segment({
        startedAt: "2026-11-15T08:00:00Z",
        endedAt: "2026-11-15T08:01:00Z",
      }),
      segment({
        startedAt: "2026-11-15T08:01:30Z",
        endedAt: "2026-11-15T08:02:00Z",
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.gapMs).toBe(30_000);
    expect(new Date(gaps[0]!.afterMs).toISOString()).toBe(
      "2026-11-15T08:01:00.000Z"
    );
    expect(new Date(gaps[0]!.beforeMs).toISOString()).toBe(
      "2026-11-15T08:01:30.000Z"
    );
  });

  it("an objectDeleted segment between two live ones does NOT mask the gap", () => {
    const gaps = deriveRecordingGaps([
      segment({
        startedAt: "2026-11-15T08:00:00Z",
        endedAt: "2026-11-15T08:01:00Z",
      }),
      segment({
        // Deleted pulse overlapping the hole — no servable coverage.
        startedAt: "2026-11-15T08:01:02Z",
        endedAt: "2026-11-15T08:01:28Z",
        objectDeleted: true,
      }),
      segment({
        startedAt: "2026-11-15T08:01:30Z",
        endedAt: "2026-11-15T08:02:00Z",
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.gapMs).toBe(30_000);
  });

  it("non-COMPLETE rows (ACTIVE/FAILED/ABORTED…) never count as coverage", () => {
    const gaps = deriveRecordingGaps([
      segment({
        startedAt: "2026-11-15T08:00:00Z",
        endedAt: "2026-11-15T08:01:00Z",
      }),
      segment({
        status: "ABORTED",
        startedAt: "2026-11-15T08:01:01Z",
        endedAt: "2026-11-15T08:01:29Z",
      }),
      segment({
        status: "ACTIVE",
        startedAt: "2026-11-15T08:01:29Z",
        endedAt: "2026-11-15T08:01:29.500Z",
      }),
      segment({
        startedAt: "2026-11-15T08:01:30Z",
        endedAt: "2026-11-15T08:02:00Z",
      }),
    ]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.gapMs).toBe(30_000);
  });

  it("segments missing timestamps are ignored entirely", () => {
    const gaps = deriveRecordingGaps([
      segment({ startedAt: "2026-11-15T08:00:00Z", endedAt: undefined }),
      segment({ startedAt: undefined, endedAt: "2026-11-15T08:02:00Z" }),
    ]);
    expect(gaps).toEqual([]);
  });

  it("threshold is strictly greater than 2s (pulse-restart seams ignored)", () => {
    expect(RECORDING_GAP_THRESHOLD_MS).toBe(2_000);
    const seam = deriveRecordingGaps([
      segment({
        startedAt: "2026-11-15T08:00:00Z",
        endedAt: "2026-11-15T08:01:00Z",
      }),
      segment({
        startedAt: "2026-11-15T08:01:02Z",
        endedAt: "2026-11-15T08:02:00Z",
      }),
    ]);
    expect(seam).toEqual([]);
  });
});
