// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECORDING_GAP_THRESHOLD_MS,
  RecordingsCard,
  deriveRecordingGaps,
  isSegmentPlayable,
} from "./RecordingsCard";
import type { RecordingSegment } from "@/lib/api/evidence";

/**
 * P4-D: derived coverage gaps only trust segments the backend could
 * actually serve clip coverage from (mirror of its findCovering):
 * COMPLETE jobs whose object still exists. Deleted or non-COMPLETE rows
 * between two live segments must NOT mask a real gap. The playback suite
 * covers the "Phát" flow: presigned URL on demand, honest no-object /
 * cleaned states, and the near-expiry URL re-fetch while playing.
 */

import type * as EvidenceApi from "@/lib/api/evidence";

vi.mock("@/lib/api/evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof EvidenceApi>();
  return {
    ...actual,
    fetchSessionRecordings: vi.fn(),
    fetchRecordingUrl: vi.fn(),
  };
});

import { fetchRecordingUrl, fetchSessionRecordings } from "@/lib/api/evidence";

const recordingsMock = vi.mocked(fetchSessionRecordings);
const urlMock = vi.mocked(fetchRecordingUrl);

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

describe("isSegmentPlayable", () => {
  it("requires COMPLETE + a real object (bytes on the wire) + not deleted", () => {
    expect(isSegmentPlayable(segment({ bytes: 1_000 }))).toBe(true);
    expect(
      isSegmentPlayable(segment({ bytes: 1_000, objectKey: "full/1.webm" }))
    ).toBe(true);
    expect(
      isSegmentPlayable(segment({ bytes: undefined, objectKey: undefined }))
    ).toBe(false);
    expect(isSegmentPlayable(segment({ status: "ACTIVE", bytes: 1_000 }))).toBe(false);
    expect(isSegmentPlayable(segment({ objectDeleted: true, bytes: 1_000 }))).toBe(false);
  });
});

describe("RecordingsCard playback (P1-3)", () => {
  const COMPLETE_SEG: RecordingSegment = {
    jobId: "11111111-0000-4000-8000-00000000000a",
    attemptId: 10,
    kind: "FULL",
    status: "COMPLETE",
    pulseIndex: 0,
    startedAt: "2026-11-15T08:00:00Z",
    endedAt: "2026-11-15T08:01:00Z",
    bytes: 1_000,
    durationMs: 60_000,
    objectDeleted: false,
  };

  function renderCard(sessionId = 5): void {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <RecordingsCard sessionId={sessionId} />
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    recordingsMock.mockReset();
    urlMock.mockReset();
    recordingsMock.mockResolvedValue([COMPLETE_SEG]);
    urlMock.mockResolvedValue({
      url: "https://signed.example/seg.webm",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  });

  afterEach(cleanup);

  it("'Phát' fetches the presigned URL on demand and renders a <video>", async () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Xem ghi hình" }));
    await screen.findByTestId("recordings-list");

    // On-demand: no URL fetch before the teacher asks to play.
    expect(urlMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Phát" }));

    const video = await screen.findByTestId("recording-video");
    expect(video.getAttribute("src")).toBe("https://signed.example/seg.webm");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith(5, COMPLETE_SEG.jobId);
  });

  it("objectDeleted row: no button, honest 'Đã dọn dẹp'; objectless rows show '—'", async () => {
    recordingsMock.mockResolvedValue([
      { ...COMPLETE_SEG, jobId: "a", objectDeleted: true },
      { ...COMPLETE_SEG, jobId: "b", bytes: undefined }, // no object behind it
      { ...COMPLETE_SEG, jobId: "c", status: "ACTIVE" },
    ]);
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Xem ghi hình" }));
    await screen.findByTestId("recordings-list");

    const rows = screen.getAllByTestId("recording-segment");
    expect(rows).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Phát" })).toBeNull();
    expect(screen.getByTestId("recording-cleaned").textContent).toContain(
      "Đã dọn dẹp"
    );
    // No-object / non-COMPLETE rows render the plain "—" marker.
    expect(rows.filter((r) => r.textContent?.includes("—"))).toHaveLength(2);
  });

  it("re-fetches the URL when the remaining TTL drops below 30s while playing", async () => {
    vi.useFakeTimers();
    try {
      // URL minted with 40s of life → refresh due ~10s from now.
      urlMock.mockResolvedValue({
        url: "https://signed.example/seg.webm",
        expiresAt: new Date(Date.now() + 40_000).toISOString(),
      });
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Xem ghi hình" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fireEvent.click(screen.getByRole("button", { name: "Phát" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const video = screen.getByTestId("recording-video");
      expect(urlMock).toHaveBeenCalledTimes(1);

      // Playing → the refresh scheduler mints a fresh URL before expiry.
      fireEvent.play(video);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_500);
      });
      expect(urlMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(urlMock).toHaveBeenLastCalledWith(5, COMPLETE_SEG.jobId);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the playback position across a presigned-URL swap", async () => {
    vi.useFakeTimers();
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    try {
      // Each mint yields a DIFFERENT url string (as presigning does).
      urlMock.mockImplementation(async () => ({
        url: `https://signed.example/seg-${urlMock.mock.calls.length}.webm`,
        expiresAt: new Date(Date.now() + 40_000).toISOString(),
      }));
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Xem ghi hình" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole("button", { name: "Phát" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const video = screen.getByTestId("recording-video") as HTMLVideoElement;
      expect(video.getAttribute("src")).toContain("seg-1.webm");

      // Teacher is 42s in and playing.
      video.currentTime = 42;
      fireEvent.play(video);
      fireEvent.timeUpdate(video);
      expect(playSpy).not.toHaveBeenCalled(); // user-driven, not auto-resume

      // Near-expiry refetch swaps the URL (seg-2)…
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_500);
      });
      expect(urlMock).toHaveBeenCalledTimes(2);
      expect(video.getAttribute("src")).toContain("seg-2.webm");

      // A real browser RESETS the element when src swaps — simulate that
      // so the restore below can only pass via the resume logic.
      video.currentTime = 0;
      fireEvent(video, new Event("loadedmetadata"));
      expect(video.currentTime).toBe(42);
      expect(playSpy).toHaveBeenCalledTimes(1);
    } finally {
      playSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("URL-mint failure (409 TOCTOU / network) → honest message, no <video>", async () => {
    urlMock.mockRejectedValue({
      kind: "api",
      status: 409,
      code: "EVIDENCE_CLIP_REJECTED",
      message: "not playable",
      raw: {},
    });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Xem ghi hình" }));
    await screen.findByTestId("recordings-list");
    fireEvent.click(screen.getByRole("button", { name: "Phát" }));

    expect(
      await screen.findByText(
        "Không phát được đoạn ghi hình này (có thể đã hết hạn hoặc bị dọn dẹp)."
      )
    ).not.toBeNull();
    expect(screen.queryByTestId("recording-video")).toBeNull();
    expect(screen.getByRole("button", { name: "Ẩn" })).not.toBeNull();
  });
});
