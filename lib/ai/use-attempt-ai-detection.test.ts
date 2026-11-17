// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedApiError } from "@/lib/api";
import {
  decideDetectionEvents,
  gazeEventBox,
  useAttemptAiDetection,
} from "./use-attempt-ai-detection";
import type * as ModelAdapter from "./model-adapter";
import type * as GazeAdapter from "./gaze-adapter";
import type { GazeEstimator } from "./gaze-adapter";
import { GAZE_FACE_CLASS_ID, type GazeObservation } from "./gaze-core";
import type { DetectionBox, DetectionFrame, Detector } from "./model-adapter";
import { getPublishedCameraTrack, setPublishedCameraTrack } from "@/lib/media/published-track";
import { resetAiTestHooks, setFakeDetectorForTest } from "./test-hooks";

/**
 * P4-C student AI hook (CONTRACT §7): honest states (model load fail →
 * unavailable; api fail → degraded; NEVER throws to the attempt UI), event
 * decisions incl. the 3-consecutive person-absent rule, ingestion payload
 * shape, and full cleanup. The REAL onnxruntime-web adapter is mocked — no
 * wasm ever loads in vitest; frames come from the SIMULATED fake detector.
 */

vi.mock("@/lib/media/livekit", () => ({
  attachTrack: vi.fn(),
}));

vi.mock("@/lib/api/ai-detections", () => ({
  ingestAiDetections: vi.fn(),
}));

// P4-D: the hook also fetches the attempt's snapshot policy once — keep it
// offline and deterministic (snapshots disabled; the snapshot-path suite
// covers the enabled branch).
vi.mock("@/lib/api/evidence", () => ({
  fetchAttemptMediaStatus: vi.fn(),
  uploadEvidenceSnapshot: vi.fn(),
}));

vi.mock("@/lib/ai/model-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof ModelAdapter>();
  return { ...actual, createDetector: vi.fn() };
});

vi.mock("@/lib/ai/gaze-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof GazeAdapter>();
  return { ...actual, createGazeEstimator: vi.fn() };
});

import { fetchAttemptMediaStatus } from "@/lib/api/evidence";
import { ingestAiDetections } from "@/lib/api/ai-detections";
import { createDetector, MODEL } from "./model-adapter";
import { createGazeEstimator, GAZE_MODEL } from "./gaze-adapter";

const ingestMock = vi.mocked(ingestAiDetections);
const createDetectorMock = vi.mocked(createDetector);
const createGazeEstimatorMock = vi.mocked(createGazeEstimator);

/** A usable gaze reading (one 200px face) with the given raw angles. */
function gazeObs(yaw: number, pitch: number): GazeObservation {
  return {
    faceCount: 1,
    faceBox: [0.3, 0.2, 0.6, 0.7],
    faceScore: 0.91,
    faceWidthPx: 200,
    yaw,
    pitch,
    processingMs: 35,
    runtime: "ORT_WEB_WEBGPU",
  };
}

/** A real-path detector double that always sees one person. */
function runningDetector(): Detector {
  return {
    status: "running",
    runtime: "ORT_WEB_WASM",
    detect: vi.fn(async () => ({ ...frame([box(0, 0.9)], Date.now()), simulated: false })),
    release: vi.fn(async () => undefined),
  };
}

function fakeTrack(readyState = "live"): MediaStreamTrack {
  return { readyState, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function box(classId: number, confidence: number): DetectionBox {
  return {
    classId,
    label: MODEL.classes[classId],
    confidence,
    bbox: [0.1, 0.2, 0.3, 0.4],
  };
}

function frame(detections: DetectionBox[], capturedAt = 1_700_000_000_000): DetectionFrame {
  return {
    detections,
    frameWidth: 1280,
    frameHeight: 720,
    processingMs: 42,
    capturedAt,
    runtime: "ORT_WEB_WASM",
    simulated: true,
  };
}

function Harness({ attemptId = 9 }: { attemptId?: number }) {
  const ai = useAttemptAiDetection(attemptId);
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "status" }, ai.status),
    createElement("span", { "data-testid": "gaze" }, ai.gaze)
  );
}

function gazeOf(): string {
  return document.querySelector<HTMLElement>('[data-testid="gaze"]')!.textContent ?? "";
}

function statusOf(): string {
  return document.querySelector<HTMLElement>('[data-testid="status"]')!.textContent ?? "";
}

/** Advance fake timers AND flush the act/microtask queue. */
async function settle(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const TICK_MS = Math.round(1000 / 1.5); // scheduler default budget 1.5 FPS
const FLUSH_MS = 2_000;
const TRACK_POLL_MS = 1_000;

let playSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  resetAiTestHooks();
  setPublishedCameraTrack(null);
  playSpy = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.mocked(fetchAttemptMediaStatus).mockResolvedValue({
    fullRecordingEnabled: false,
    rollingBufferActive: false,
    snapshotsEnabled: false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  playSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("decideDetectionEvents (pure, CONTRACT §6)", () => {
  it("phone: any cell-phone box ≥0.5 → PHONE_OBSERVED with that box", () => {
    // streak 0 → 1 (a phone is not a person, but ONE absent frame never
    // fires the absence event — that needs 3).
    const d = decideDetectionEvents([box(67, 0.5)], { personAbsentStreak: 0 });
    expect(d.events).toEqual([
      { eventType: "PHONE_OBSERVED", detections: [box(67, 0.5)] },
    ]);
    expect(d.counters.personAbsentStreak).toBe(1);
  });

  it("a phone box below 0.5 fires nothing", () => {
    const d = decideDetectionEvents([box(67, 0.49)], { personAbsentStreak: 0 });
    expect(d.events).toEqual([]);
  });

  it("screen: tv/laptop boxes ≥0.5 → SCREEN_OBSERVED with both boxes", () => {
    const tv = box(62, 0.7);
    const laptop = box(63, 0.6);
    const d = decideDetectionEvents([tv, laptop], { personAbsentStreak: 0 });
    expect(d.events).toEqual([{ eventType: "SCREEN_OBSERVED", detections: [tv, laptop] }]);
  });

  it("multi: ≥2 person boxes ≥0.5 → MULTIPLE_PERSONS_OBSERVED (person boxes)", () => {
    const p1 = box(0, 0.9);
    const p2 = box(0, 0.8);
    const faint = box(0, 0.45); // presence bar but not event bar
    const d = decideDetectionEvents([p1, p2, faint], { personAbsentStreak: 0 });
    expect(d.events).toEqual([
      { eventType: "MULTIPLE_PERSONS_OBSERVED", detections: [p1, p2] },
    ]);
  });

  it("person-absent: fires PERSON_NOT_OBSERVED only on the 3rd consecutive frame", () => {
    const first = decideDetectionEvents([], { personAbsentStreak: 0 });
    expect(first.events).toEqual([]);
    const second = decideDetectionEvents([], first.counters);
    expect(second.events).toEqual([]);
    const third = decideDetectionEvents([], second.counters);
    expect(third.events).toEqual([
      { eventType: "PERSON_NOT_OBSERVED", detections: [] },
    ]);
  });

  it("person-absent: a faint person (≥0.4) resets the streak", () => {
    const faint = decideDetectionEvents([box(0, 0.42)], { personAbsentStreak: 2 });
    expect(faint.events).toEqual([]);
    expect(faint.counters.personAbsentStreak).toBe(0);
  });

  it("after an absence event the streak re-accumulates 3 frames", () => {
    const fired = decideDetectionEvents([], { personAbsentStreak: 2 });
    expect(fired.events).toHaveLength(1);
    const next = decideDetectionEvents([], fired.counters); // streak 4 → no
    expect(next.events).toEqual([]);
    const again = decideDetectionEvents([], { personAbsentStreak: 5 }); // 6 → fires
    expect(again.events).toHaveLength(1);
  });
});

describe("useAttemptAiDetection", () => {
  it("model load failure → honest 'unavailable' (no fake results, no ingest)", async () => {
    setPublishedCameraTrack(fakeTrack());
    const unavailable: Detector = {
      status: "unavailable",
      runtime: null,
      detect: vi.fn(async () => null),
      release: vi.fn(async () => undefined),
    };
    createDetectorMock.mockResolvedValue(unavailable);

    render(createElement(Harness, {}));
    await settle(0);

    expect(statusOf()).toBe("unavailable");
    await settle(FLUSH_MS * 3);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("fake detector (SIMULATED) drives ingestion with contract-shaped items", async () => {
    setPublishedCameraTrack(fakeTrack());
    const phone = box(67, 0.83);
    setFakeDetectorForTest(() => frame([phone]));
    ingestMock.mockResolvedValue({ results: [] });

    render(createElement(Harness, {}));
    await settle(0);
    expect(statusOf()).toBe("running");

    // Ticks at the 1.5FPS cadence queue one PHONE_OBSERVED per analysis;
    // the flush interval then ships a batch — assert its contract shape.
    await settle(TICK_MS + FLUSH_MS);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const [attemptId, items] = ingestMock.mock.calls[0];
    expect(attemptId).toBe(9);
    const first = items[0];
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(first).toEqual(
      expect.objectContaining({
        eventType: "PHONE_OBSERVED",
        modelId: "yolo26s",
        modelVersion: "8.4.64-onnx",
        runtime: "ORT_WEB_WASM",
        frameWidth: 1280,
        frameHeight: 720,
        processingMs: 42,
        detections: [
          {
            classId: 67,
            label: "cell phone",
            confidence: 0.83,
            bbox: [0.1, 0.2, 0.3, 0.4],
          },
        ],
      })
    );
    // Sequences are monotonic; eventIds are unique strings (UUID).
    const eventIds = new Set(items.map((i) => i.eventId));
    expect(eventIds.size).toBe(items.length);
    expect(items.map((i) => i.sequence)).toEqual(items.map((_, i) => i + 1));
  });

  it("API failure (after retry ×1) → 'degraded' ONLY, never a throw; recovers on success", async () => {
    setPublishedCameraTrack(fakeTrack());
    setFakeDetectorForTest(() => frame([])); // person-absent stream
    const networkError: NormalizedApiError = {
      kind: "network",
      message: "offline",
      raw: {},
    };
    ingestMock
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ results: [] });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(createElement(Harness, {}));
    await settle(0);
    expect(statusOf()).toBe("running");

    // Absent frames fire PERSON_NOT_OBSERVED every 3rd analysis; the flush
    // cadence ships it, the call fails, the ×1 retry fails → degraded.
    await settle(TICK_MS * 3 + FLUSH_MS + 100);
    expect(statusOf()).toBe("degraded");
    expect(ingestMock.mock.calls.length).toBeGreaterThanOrEqual(2); // initial + retry ×1
    expect(consoleError).not.toHaveBeenCalled(); // never propagated
    consoleError.mockRestore();

    // Later batches succeed → back to 'running' (detection never stopped).
    // P2-5 pacing: a type suppressed for 10s — advance past the window so a
    // fresh PERSON_NOT_OBSERVED is queued, flushed and succeeds.
    await settle(TICK_MS * 20 + FLUSH_MS * 2);
    expect(statusOf()).toBe("running");
  });

  it("autoplay failure → 'unavailable'", async () => {
    setPublishedCameraTrack(fakeTrack());
    playSpy.mockRestore();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("autoplay blocked")
    );
    render(createElement(Harness, {}));
    await settle(0);
    expect(statusOf()).toBe("unavailable");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("unmount: status 'released', timers dead — no further frames or ingests", async () => {
    setPublishedCameraTrack(fakeTrack());
    setFakeDetectorForTest(() => frame([box(67, 0.9)]));
    ingestMock.mockResolvedValue({ results: [] });
    const { unmount } = render(createElement(Harness, {}));
    await settle(0);
    expect(statusOf()).toBe("running");
    unmount();

    await settle(TICK_MS * 4 + FLUSH_MS * 2);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("waits (idle) while no camera track is published yet", async () => {
    setPublishedCameraTrack(null);
    render(createElement(Harness, {}));
    await settle(TRACK_POLL_MS * 3);
    expect(statusOf()).toBe("idle");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("no shared camera ownership: the published track is never stopped by the AI hook", async () => {
    const track = fakeTrack();
    setPublishedCameraTrack(track);
    setFakeDetectorForTest(() => frame([]));
    ingestMock.mockResolvedValue({ results: [] });
    const { unmount } = render(createElement(Harness, {}));
    await settle(0);
    unmount();
    await settle(FLUSH_MS);
    expect(track.stop).not.toHaveBeenCalled();
  });
});

describe("gazeEventBox (pure)", () => {
  it("sustained: face box + face score, direction and deviation in the label", () => {
    const b = gazeEventBox(
      { kind: "sustained", direction: "left", deltaYaw: -38.4, deltaPitch: 3.2, seconds: 4 },
      gazeObs(-38, 3)
    );
    expect(b).toEqual({
      classId: GAZE_FACE_CLASS_ID,
      label: "gaze:left:-38:3",
      confidence: 0.91,
      bbox: [0.3, 0.2, 0.6, 0.7],
    });
  });

  it("frequent: labeled 'frequent' whatever the momentary direction", () => {
    const b = gazeEventBox(
      { kind: "frequent", direction: null, deltaYaw: 0, deltaPitch: 0, seconds: 14 },
      gazeObs(0, 0)
    );
    expect(b?.label).toBe("gaze:frequent:0:0");
  });

  it("no face box → no event box", () => {
    const noFace: GazeObservation = {
      ...gazeObs(0, 0),
      faceCount: 0,
      faceBox: null,
      faceScore: null,
    };
    expect(
      gazeEventBox(
        { kind: "sustained", direction: "down", deltaYaw: 0, deltaPitch: -30, seconds: 4 },
        noFace
      )
    ).toBeNull();
  });
});

describe("useAttemptAiDetection — gaze", () => {
  it("sustained looking away → ONE LOOKING_AWAY_OBSERVED with the gaze model identity", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    const t0 = Date.now();
    // On screen for 5s (auto-calibration), then looking left. A person box
    // keeps PERSON_NOT_OBSERVED out of the batch.
    setFakeDetectorForTest(() => ({
      ...frame([box(0, 0.9)], Date.now()),
      gaze: Date.now() - t0 < 5_000 ? gazeObs(0, 0) : gazeObs(-40, 2),
    }));

    render(createElement(Harness, {}));
    await settle(0);
    expect(gazeOf()).toBe("off"); // no reading yet
    await settle(TICK_MS * 2);
    expect(gazeOf()).toBe("calibrating");
    await settle(4_500 - TICK_MS * 2);
    expect(gazeOf()).toBe("running");
    expect(ingestMock).not.toHaveBeenCalled(); // on screen → nothing to send

    // ~1s smoothing + 3s sustained + flush cadence.
    await settle(9_000);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const items = ingestMock.mock.calls[0][1];
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        eventType: "LOOKING_AWAY_OBSERVED",
        modelId: GAZE_MODEL.id,
        modelVersion: GAZE_MODEL.version,
        runtime: "ORT_WEB_WEBGPU",
        processingMs: 35,
        frameWidth: 1280,
        frameHeight: 720,
        detections: [
          {
            classId: GAZE_FACE_CLASS_ID,
            label: "gaze:left:-40:2",
            confidence: 0.91,
            bbox: [0.3, 0.2, 0.6, 0.7],
          },
        ],
      })
    );
    expect(createGazeEstimatorMock).not.toHaveBeenCalled(); // fake path owns gaze
  });

  it("looking at the screen the whole time sends nothing", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    setFakeDetectorForTest(() => ({
      ...frame([box(0, 0.9)], Date.now()),
      gaze: gazeObs(6, -4),
    }));
    render(createElement(Harness, {}));
    await settle(30_000);
    expect(gazeOf()).toBe("running");
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it("real path: the estimator's reading is attached to each frame and drives events", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    createDetectorMock.mockResolvedValue(runningDetector());
    const t0 = Date.now();
    const estimator: GazeEstimator = {
      status: "running",
      runtime: "ORT_WEB_WEBGPU",
      estimate: vi.fn(async () => (Date.now() - t0 < 5_000 ? gazeObs(0, 0) : gazeObs(0, -35))),
      release: vi.fn(async () => undefined),
    };
    createGazeEstimatorMock.mockResolvedValue(estimator);

    const { unmount } = render(createElement(Harness, {}));
    await settle(0);
    expect(statusOf()).toBe("running");
    await settle(14_000);
    expect(estimator.estimate).toHaveBeenCalled();
    expect(ingestMock).toHaveBeenCalledTimes(1);
    expect(ingestMock.mock.calls[0][1][0]).toEqual(
      expect.objectContaining({
        eventType: "LOOKING_AWAY_OBSERVED",
        detections: [expect.objectContaining({ label: "gaze:down:0:-35" })],
      })
    );
    unmount();
    expect(estimator.release).toHaveBeenCalledTimes(1);
  });

  it("gaze models unavailable → gaze 'unavailable', object detection keeps running", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    const detector = runningDetector();
    createDetectorMock.mockResolvedValue(detector);
    createGazeEstimatorMock.mockResolvedValue({
      status: "unavailable",
      runtime: null,
      estimate: vi.fn(async () => null),
      release: vi.fn(async () => undefined),
    });

    render(createElement(Harness, {}));
    await settle(TICK_MS * 4);
    expect(statusOf()).toBe("running");
    expect(gazeOf()).toBe("unavailable");
    expect(detector.detect).toHaveBeenCalled();
  });

  it("gaze estimator creation rejecting never surfaces — gaze 'unavailable' only", async () => {
    setPublishedCameraTrack(fakeTrack());
    createDetectorMock.mockResolvedValue(runningDetector());
    createGazeEstimatorMock.mockRejectedValue(new Error("boom"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(createElement(Harness, {}));
    await settle(TICK_MS * 2);
    expect(statusOf()).toBe("running");
    expect(gazeOf()).toBe("unavailable");
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("an estimator that keeps throwing is dropped after 3 frames; frames still flow", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    const detector = runningDetector();
    createDetectorMock.mockResolvedValue(detector);
    const estimator: GazeEstimator = {
      status: "running",
      runtime: "ORT_WEB_WASM",
      estimate: vi.fn(async () => {
        throw new Error("SIMULATED gaze failure");
      }),
      release: vi.fn(async () => undefined),
    };
    createGazeEstimatorMock.mockResolvedValue(estimator);

    render(createElement(Harness, {}));
    await settle(TICK_MS * 6);
    expect(gazeOf()).toBe("unavailable");
    expect(estimator.estimate).toHaveBeenCalledTimes(3);
    expect(estimator.release).toHaveBeenCalledTimes(1);
    expect(statusOf()).toBe("running");
    const before = vi.mocked(detector.detect).mock.calls.length;
    await settle(TICK_MS * 3);
    expect(vi.mocked(detector.detect).mock.calls.length).toBeGreaterThan(before);
  });
});

describe("useAttemptAiDetection — batch pacing", () => {
  it("staggered event types are coalesced: sends stay ≥11s apart", async () => {
    setPublishedCameraTrack(fakeTrack());
    ingestMock.mockResolvedValue({ results: [] });
    const t0 = Date.now();
    // Phone from the start; a second type (screen) joins 4s later, so the
    // two 10s per-type pacing windows are out of phase.
    setFakeDetectorForTest(() => {
      const boxes = [box(0, 0.9), box(67, 0.9)];
      if (Date.now() - t0 >= 4_000) boxes.push(box(62, 0.9));
      return frame(boxes, Date.now());
    });
    const sentAt: number[] = [];
    ingestMock.mockImplementation(async () => {
      sentAt.push(Date.now());
      return { results: [] };
    });

    render(createElement(Harness, {}));
    await settle(60_000);
    expect(sentAt.length).toBeGreaterThanOrEqual(3);
    expect(sentAt.length).toBeLessThanOrEqual(6); // server limit: 6 batches/min
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i] - sentAt[i - 1]).toBeGreaterThanOrEqual(11_000);
    }
  });
});

describe("published-track registry", () => {
  it("an ended track self-cleans to null", () => {
    setPublishedCameraTrack(fakeTrack("ended"));
    expect(getPublishedCameraTrack()).toBeNull();
  });
});
