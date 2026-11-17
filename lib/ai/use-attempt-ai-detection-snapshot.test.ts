// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAttemptAiDetection } from "./use-attempt-ai-detection";
import type * as ModelAdapter from "./model-adapter";
import type {
  DetectionBox,
  DetectionFrame,
} from "./model-adapter";
import { setPublishedCameraTrack } from "@/lib/media/published-track";
import { resetAiTestHooks, setFakeDetectorForTest } from "./test-hooks";
import type { AttemptMediaStatus } from "@/lib/api/evidence";

/**
 * P4-D snapshot capture path (issue #91): when the ingest response carries a
 * snapshotRequest and the policy enables snapshots, the hook captures the
 * feeder's CURRENT frame (canvas JPEG) and uploads ONE snapshot per request
 * with a fresh idempotencyKey. Capture/upload failure ONLY flips
 * snapshotState — the detection loop is never affected.
 */

const evidenceMock = vi.hoisted(() => ({
  fetchAttemptMediaStatus: vi.fn(),
  uploadEvidenceSnapshot: vi.fn(),
}));

vi.mock("@/lib/api/evidence", () => evidenceMock);

vi.mock("@/lib/media/livekit", () => ({
  attachTrack: vi.fn(),
}));

vi.mock("@/lib/api/ai-detections", () => ({
  ingestAiDetections: vi.fn(),
}));

vi.mock("@/lib/ai/model-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof ModelAdapter>();
  return { ...actual, createDetector: vi.fn() };
});

import { ingestAiDetections } from "@/lib/api/ai-detections";
import { uploadEvidenceSnapshot } from "@/lib/api/evidence";
import { MODEL } from "./model-adapter";
import type { AiDetectionItem } from "@/lib/api/ai-detections";

const ingestMock = vi.mocked(ingestAiDetections);
const uploadMock = vi.mocked(uploadEvidenceSnapshot);
const mediaStatusMock = vi.mocked(evidenceMock.fetchAttemptMediaStatus);

function fakeTrack(): MediaStreamTrack {
  return { readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
}

function phone(): DetectionBox {
  return {
    classId: 67,
    label: MODEL.classes[67],
    confidence: 0.9,
    bbox: [0.1, 0.2, 0.3, 0.4],
  };
}

function frame(detections: DetectionBox[]): DetectionFrame {
  return {
    detections,
    frameWidth: 1280,
    frameHeight: 720,
    processingMs: 42,
    capturedAt: 1_700_000_000_000,
    runtime: "ORT_WEB_WASM",
    simulated: true,
  };
}

function Harness({ attemptId = 9 }: { attemptId?: number }) {
  const ai = useAttemptAiDetection(attemptId);
  return createElement(
    "span",
    { "data-testid": "status" },
    `${ai.status}|${ai.snapshotState}`
  );
}

function statusOf(): string {
  return document.querySelector<HTMLElement>('[data-testid="status"]')!
    .textContent ?? "";
}

/** Advance fake timers AND flush the act/microtask queue. */
async function settle(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const TICK_MS = Math.round(1000 / 1.5); // scheduler default budget 1.5 FPS
const FLUSH_MS = 2_000;

/** Ingest mock answering ACCEPTED with a snapshotRequest on the FIRST item. */
function ingestAsksForSnapshot(): void {
  ingestMock.mockImplementation(
    async (_attemptId: number, items: AiDetectionItem[]) => ({
      results: items.map((item, i) => ({
        eventId: item.eventId,
        status: "ACCEPTED" as const,
        snapshotRequest:
          i === 0 ? { alertId: 55, reason: "ALERT_OPENED" as const } : undefined,
      })),
    })
  );
}

/** jsdom cannot decode/canvas real video — stub the capture pipeline. */
function stubCanvasCapture(ok: boolean): void {
  vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
  vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(720);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback: BlobCallback) => {
      callback(
        ok ? new Blob(["jpeg-bytes"], { type: "image/jpeg" }) : null
      );
    }
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetAiTestHooks();
  setPublishedCameraTrack(fakeTrack());
  mediaStatusMock.mockResolvedValue({
    fullRecordingEnabled: false,
    rollingBufferActive: false,
    snapshotsEnabled: true,
  });
  uploadMock.mockResolvedValue({
    evidenceId: "ev-1",
    status: "AVAILABLE",
    provenance: "CLIENT_CAPTURE",
    idempotentReplay: false,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAttemptAiDetection snapshot capture (P4-D)", () => {
  it("uploads the frame the detection ran on, not a later one", async () => {
    setFakeDetectorForTest(() => frame([phone()]));
    vi.spyOn(HTMLVideoElement.prototype, "videoWidth", "get").mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, "videoHeight", "get").mockReturnValue(720);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    // Every encode yields a distinguishable blob: "frame-1" is the encode
    // made when the event was queued, later numbers are later captures.
    let encodes = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback: BlobCallback) => {
        encodes += 1;
        callback(new Blob([`frame-${encodes}`], { type: "image/jpeg" }));
      }
    );
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    // First analyzed frame queues the event; the batch is only sent later
    // (flush pacing), after more frames have been analyzed.
    await settle(TICK_MS + FLUSH_MS + 100);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const request = uploadMock.mock.calls[0][1];
    expect(await (request.blob as Blob).text()).toBe("frame-1");
    // Capture time is the analyzed frame's, not the upload moment.
    expect(request.capturedAtMs).toBe(1_700_000_000_000);
  });

  it("uploads ONE snapshot per snapshotRequest with a fresh idempotencyKey", async () => {
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    expect(ingestMock).toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [attemptId, request] = uploadMock.mock.calls[0];
    expect(attemptId).toBe(9);
    expect(request.alertId).toBe(55);
    expect(request.idempotencyKey).toMatch(/^[\w-]{8,}$/);
    expect(request.capturedAtMs).toBeTypeOf("number");
    expect(request.blob).toBeInstanceOf(Blob);
    expect((request.blob as Blob).type).toBe("image/jpeg");

    // Transient pill state flipped; the loop itself stays healthy.
    expect(statusOf()).toBe("running|sent");
  });

  it("distinct snapshotRequests each upload exactly once", async () => {
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestMock.mockImplementation(async (_attemptId: number, items) => ({
      results: items.map((item) => ({
        eventId: item.eventId,
        status: "ACCEPTED" as const,
        snapshotRequest: { alertId: 55, reason: "ALERT_OPENED" as const },
      })),
    }));

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    // The batch shipped one event (10s per-type suppression) → one request.
    expect(uploadMock.mock.calls.length).toBe(ingestMock.mock.calls.length);
    const keys = uploadMock.mock.calls.map(([, req]) => req.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("capture failure → snapshotState 'failed', detection loop unaffected", async () => {
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(false); // toBlob yields null (no frame/canvas)
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    expect(uploadMock).not.toHaveBeenCalled();
    expect(statusOf()).toBe("running|failed");

    // The loop keeps running: after the 10s suppression window a fresh
    // PHONE_OBSERVED is queued and flushed (ingest called again).
    await settle(TICK_MS * 16 + FLUSH_MS * 2);
    expect(ingestMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(statusOf()).toContain("running");
  });

  it("buffers requests arriving BEFORE the policy resolves, uploads after ON", async () => {
    const { promise, resolve } = Promise.withResolvers<AttemptMediaStatus>();
    mediaStatusMock.mockReturnValue(promise);
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    // Ingest happened, but the snapshot request is buffered while the
    // policy is unknown — nothing uploaded yet.
    expect(ingestMock).toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();

    await act(async () => {
      resolve({
        fullRecordingEnabled: false,
        rollingBufferActive: false,
        snapshotsEnabled: true,
      });
    });
    await settle(0);

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][1].alertId).toBe(55);
    expect(statusOf()).toBe("running|sent");
  });

  it("media-status fetch FAILURE → buffered requests are attempted anyway (server gates)", async () => {
    const { promise, reject } = Promise.withResolvers<AttemptMediaStatus>();
    mediaStatusMock.mockReturnValue(promise);
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);
    expect(uploadMock).not.toHaveBeenCalled();

    await act(async () => {
      reject(new Error("offline"));
    });
    await settle(0);

    // Honest authority is the server policy gate — the client attempts.
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(statusOf()).toBe("running|sent");
  });

  it("upload rejection → 'failed' ONLY (never throws into the attempt UI)", async () => {
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestAsksForSnapshot();
    uploadMock.mockRejectedValue({ kind: "api", status: 429, message: "limit", raw: {} });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    expect(statusOf()).toBe("running|failed");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("skips capture entirely when the policy disables snapshots", async () => {
    mediaStatusMock.mockResolvedValue({
      fullRecordingEnabled: false,
      rollingBufferActive: true,
      snapshotsEnabled: false,
    });
    setFakeDetectorForTest(() => frame([phone()]));
    stubCanvasCapture(true);
    ingestAsksForSnapshot();

    render(createElement(Harness, {}));
    await settle(TICK_MS + FLUSH_MS + 100);

    expect(mediaStatusMock).toHaveBeenCalledWith(9);
    expect(ingestMock).toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(statusOf()).toBe("running|idle");
  });
});
