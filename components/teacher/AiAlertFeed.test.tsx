// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiAlertCard,
  AiAlertFeed,
  describeGazeLabel,
  isAiAlertActivity,
  mergeAlertItems,
  snapshotsByAlert,
} from "./AiAlertFeed";
import type { AiAlertItem } from "@/lib/api/ai-detections";
import type { EvidenceItem } from "@/lib/api/evidence";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-C teacher AI alert feed (CONTRACT §6/§7): REST-backed render, cursor
 * merge by alertId (newest first), bbox mini-render math from normalized
 * latestDetections, honesty disclaimer + provenance chip. AI_ALERT_* ping
 * gating is covered by isAiAlertActivity.
 */

import type * as Api from "@/lib/api/ai-detections";

vi.mock("@/lib/api/ai-detections", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return { ...actual, getSessionAiAlerts: vi.fn() };
});

import type * as EvidenceApi from "@/lib/api/evidence";

vi.mock("@/lib/api/evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof EvidenceApi>();
  return { ...actual, fetchSessionEvidence: vi.fn(), fetchEvidenceUrl: vi.fn() };
});

import { getSessionAiAlerts } from "@/lib/api/ai-detections";
import { fetchEvidenceUrl, fetchSessionEvidence } from "@/lib/api/evidence";

const alertsMock = vi.mocked(getSessionAiAlerts);
const evidenceMock = vi.mocked(fetchSessionEvidence);
const evidenceUrlMock = vi.mocked(fetchEvidenceUrl);

function snapshotItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    evidenceId: "ev-1",
    attemptId: 10,
    alertId: 1,
    kind: "SNAPSHOT",
    status: "AVAILABLE",
    provenance: "CLIENT_CAPTURE",
    width: 640,
    height: 360,
    capturedAt: "2026-11-15T08:00:01Z",
    createdAt: "2026-11-15T08:00:02Z",
    expiresAt: "2026-12-15T08:00:02Z",
    ...overrides,
  };
}

function alertItem(overrides: Partial<AiAlertItem> = {}): AiAlertItem {
  return {
    alertId: 1,
    attemptId: 10,
    studentUserId: 77,
    studentName: "Nguyen Van A",
    alertType: "PHONE_DETECTED",
    status: "OPEN",
    firstDetectedAt: "2026-11-15T08:00:00Z",
    lastDetectedAt: "2026-11-15T08:00:20Z",
    detectionCount: 3,
    maxConfidence: 0.87,
    modelId: "yolo26s",
    modelVersion: "8.4.64-onnx",
    provenance: "CLIENT_MODEL",
    latestDetections: [
      { classId: 67, label: "cell phone", confidence: 0.87, bbox: [0.1, 0.2, 0.5, 0.6] },
    ],
    ...overrides,
  };
}

function renderFeed(sessionId = 5): { container: HTMLElement; client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <AiAlertFeed sessionId={sessionId} />
    </QueryClientProvider>
  );
  return { container, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a session without stored snapshots.
  evidenceMock.mockResolvedValue([]);
});

afterEach(cleanup);

describe("mergeAlertItems (cursor merge)", () => {
  it("unions by alertId with the fresher page winning", () => {
    const old = alertItem({ alertId: 2, detectionCount: 1 });
    const fresh = alertItem({ alertId: 2, detectionCount: 9 });
    expect(mergeAlertItems([old], [fresh])[0].detectionCount).toBe(9);
  });

  it("sorts newest (highest alertId) first", () => {
    const a = alertItem({ alertId: 1 });
    const b = alertItem({ alertId: 5 });
    const c = alertItem({ alertId: 3 });
    expect(mergeAlertItems([], [a, b, c]).map((i) => i.alertId)).toEqual([5, 3, 1]);
  });

  it("keeps older accumulated items when a new page arrives", () => {
    const old = alertItem({ alertId: 1 });
    const next = alertItem({ alertId: 9 });
    expect(mergeAlertItems([old], [next])).toHaveLength(2);
  });
});

describe("isAiAlertActivity", () => {
  const envelope = (activityType: string | null): RealtimeEventEnvelope =>
    ({
      eventId: "e",
      eventType: "ATTEMPT_ACTIVITY",
      occurredAt: "2026-11-15T08:00:00Z",
      serverTime: "2026-11-15T08:00:00Z",
      activityType,
    }) as RealtimeEventEnvelope;

  it("matches AI_ALERT_* activity types", () => {
    expect(isAiAlertActivity(envelope("AI_ALERT_RAISED"))).toBe(true);
    expect(isAiAlertActivity(envelope("AI_ALERT_UPDATED"))).toBe(true);
  });

  it("ignores other activity types and absent type", () => {
    expect(isAiAlertActivity(envelope("CAMERA_CONNECTED"))).toBe(false);
    expect(isAiAlertActivity(envelope(null))).toBe(false);
  });
});

describe("AiAlertFeed", () => {
  it("renders cards from the REST backfill with contract fields", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem()], nextCursor: null });
    renderFeed();

    const feed = await screen.findByTestId("ai-alert-feed");
    expect(feed.textContent).toContain("AI observations only — they do not automatically establish misconduct.");
    const card = await screen.findByTestId("ai-alert-card");
    expect(card.textContent).toContain("Nguyen Van A");
    expect(card.textContent).toContain("Phone detected");
    expect(card.textContent).toContain("87%");
    expect(card.textContent).toContain("yolo26s@8.4.64-onnx");
    expect(card.textContent).toContain("CLIENT MODEL");
  });

  it("positions bbox boxes from normalized latestDetections", async () => {
    alertsMock.mockResolvedValue({
      items: [
        alertItem({
          latestDetections: [
            { classId: 67, label: "cell phone", confidence: 0.9, bbox: [0.1, 0.2, 0.5, 0.6] },
            { classId: 0, label: "person", confidence: 0.8, bbox: [0, 0, 1, 1] },
          ],
        }),
      ],
      nextCursor: null,
    });
    renderFeed();

    const canvas = await screen.findByTestId("ai-alert-bboxes");
    const boxes = [...canvas.querySelectorAll<HTMLElement>("div.absolute")];
    expect(boxes).toHaveLength(2);
    const [phone, person] = boxes;
    expect(phone.style.width).toBe("40%");
    expect(phone.style.height).toBe("40%");
    expect(person.style.left).toBe("0%");
    expect(person.style.width).toBe("100%");
    // Honesty label: boxes only while no snapshot exists for the alert.
    expect(canvas.textContent).toContain("cell phone 90%");
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "Detection boxes from the analyzed frame — no evidence image is available for this alert"
    );
    expect(screen.queryByTestId("ai-alert-snapshot")).toBeNull();
  });

  it("shows the empty state when no alerts exist", async () => {
    alertsMock.mockResolvedValue({ items: [], nextCursor: null });
    renderFeed();
    const feed = await screen.findByText("No AI alerts yet.");
    expect(feed.closest('[data-testid="ai-alert-feed"]')).not.toBeNull();
  });

  it("merges a refetched page without duplicating cards (ping refetch)", async () => {
    alertsMock.mockResolvedValueOnce({ items: [alertItem()], nextCursor: null });
    const { container, client } = renderFeed();
    await screen.findByTestId("ai-alert-card");
    expect(container.querySelectorAll('[data-testid="ai-alert-card"]')).toHaveLength(1);

    // The same alert, updated server-side — what an AI_ALERT_* ping makes
    // LiveMonitor invalidate + refetch.
    alertsMock.mockResolvedValue({
      items: [alertItem({ detectionCount: 7 })],
      nextCursor: null,
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["exam-sessions", 5, "ai-alerts"],
      });
    });
    const cards = container.querySelectorAll('[data-testid="ai-alert-card"]');
    expect(cards).toHaveLength(1); // merged, not duplicated
    expect(cards[0].textContent).toContain("7"); // freshest count won
  });
});

describe("AiAlertCard", () => {
  function renderCard(item: AiAlertItem): {
    container: HTMLElement;
    client: QueryClient;
    unmount: () => void;
  } {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = render(
      <QueryClientProvider client={client}>
        <AiAlertCard alert={item} sessionId={5} />
      </QueryClientProvider>
    );
    return { container: rendered.container, client, unmount: rendered.unmount };
  }

  it("labels each alert type in English", () => {
    const types: Array<[AiAlertItem["alertType"], string]> = [
      ["PHONE_DETECTED", "Phone detected"],
      ["SCREEN_DETECTED", "Secondary screen detected"],
      ["MULTIPLE_PERSONS_DETECTED", "Multiple people detected"],
      ["PERSON_NOT_VISIBLE", "Student not visible"],
    ];
    for (const [alertType, label] of types) {
      const { container, unmount } = renderCard(
        alertItem({ alertType, latestDetections: null })
      );
      expect(container.textContent).toContain(label);
      unmount();
    }
  });

  it("LOOKING_AWAY: English label, direction + deviation summary, review-only note", () => {
    const { container } = renderCard(
      alertItem({
        alertType: "LOOKING_AWAY",
        modelId: "mobilegaze-mobileone-s0",
        modelVersion: "gaze360-onnx",
        maxConfidence: 0.91,
        latestDetections: [
          { classId: 1000, label: "gaze:left:-38:3", confidence: 0.91, bbox: [0.3, 0.2, 0.6, 0.7] },
        ],
      })
    );
    expect(screen.getByText("Looking away from the screen")).toBeTruthy();
    const note = container.querySelector('[data-testid="ai-alert-gaze"]')?.textContent ?? "";
    expect(note).toContain("Looking to the left · horizontal deviation -38°, vertical deviation +3° from baseline");
    expect(note).toContain("for instructor reference only");
    expect(screen.getByText("Face confidence")).toBeTruthy();
    // The face box is drawn and tagged as a face, never as a COCO class.
    const boxes = container.querySelector('[data-testid="ai-alert-bboxes"]');
    expect(boxes?.textContent).toContain("face 91%");
    expect(boxes?.textContent).not.toContain("gaze:");
  });

  it("LOOKING_AWAY without a parsable payload still shows the review-only note", () => {
    const { container } = renderCard(
      alertItem({ alertType: "LOOKING_AWAY", latestDetections: null })
    );
    const note = container.querySelector('[data-testid="ai-alert-gaze"]')?.textContent ?? "";
    expect(note).toContain("Gaze direction is a model estimate");
    expect(note).not.toContain("from baseline");
  });

  it("non-gaze alerts carry no gaze note", () => {
    const { container } = renderCard(alertItem());
    expect(container.querySelector('[data-testid="ai-alert-gaze"]')).toBeNull();
  });

  it("shows the WORKER chip for worker-verified provenance", () => {
    const { container } = renderCard(
      alertItem({ provenance: "WORKER_VERIFIED", latestDetections: null })
    );
    expect(container.textContent).toContain("WORKER");
  });

  it("renders without detections (no bbox area)", () => {
    const { container } = renderCard(alertItem({ latestDetections: null }));
    expect(container.querySelector('[data-testid="ai-alert-bboxes"]')).toBeNull();
  });

  // P4-E provenance distinction chips.
  it("shows AI-detected + Unreviewed when no review exists", () => {
    const { container } = renderCard(alertItem({ latestDetections: null }));
    expect(container.textContent).toContain("AI-detected");
    expect(container.textContent).toContain("Unreviewed");
  });

  it("shows the Instructor review outcome chip once reviewed", () => {
    const { container } = renderCard(
      alertItem({
        latestDetections: null,
        reviewStatus: "FALSE_POSITIVE",
        reviewVersion: 2,
      })
    );
    expect(container.textContent).toContain("Instructor review · False positive");
    expect(container.textContent).not.toContain("Unreviewed");
  });
});

describe("describeGazeLabel", () => {
  it("summarizes each direction in English", () => {
    expect(describeGazeLabel("gaze:right:31:0")).toBe(
      "Looking to the right · horizontal deviation +31°, vertical deviation 0° from baseline"
    );
    expect(describeGazeLabel("gaze:down:2:-27")).toContain("downward");
    expect(describeGazeLabel("gaze:up:0:24")).toContain("upward");
    expect(describeGazeLabel("gaze:frequent:0:0")).toContain("repeatedly");
  });

  it("is null for non-gaze labels", () => {
    expect(describeGazeLabel("cell phone")).toBeNull();
    expect(describeGazeLabel(null)).toBeNull();
  });
});

describe("snapshotsByAlert", () => {
  it("keeps the newest AVAILABLE snapshot per alert and ignores the rest", () => {
    const map = snapshotsByAlert([
      snapshotItem({ evidenceId: "old", capturedAt: "2026-11-15T08:00:01Z" }),
      snapshotItem({ evidenceId: "new", capturedAt: "2026-11-15T08:00:09Z" }),
      snapshotItem({ evidenceId: "pending", status: "PENDING", capturedAt: "2026-11-15T08:00:30Z" }),
      snapshotItem({ evidenceId: "clip", kind: "CLIP", capturedAt: "2026-11-15T08:00:40Z" }),
      snapshotItem({ evidenceId: "other", alertId: 2 }),
      snapshotItem({ evidenceId: "expired", alertId: 3, status: "EXPIRED" }),
    ]);
    expect(map.get(1)?.evidenceId).toBe("new");
    expect(map.get(2)?.evidenceId).toBe("other");
    expect(map.has(3)).toBe(false);
  });
});

describe("AiAlertFeed evidence snapshot in the bbox frame (P4-D)", () => {
  it("shows the alert's snapshot under the boxes, sized to the image", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1 })], nextCursor: null });
    evidenceMock.mockResolvedValue([snapshotItem()]);
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/snap.jpg?sig=x",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    renderFeed(5);
    const img = (await screen.findByTestId("ai-alert-snapshot")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("http://minio.test/snap.jpg?sig=x");
    expect(evidenceMock).toHaveBeenCalledWith(5, { kind: "SNAPSHOT", limit: 100 });
    expect(evidenceUrlMock).toHaveBeenCalledWith(5, "ev-1");
    const frame = screen.getByTestId("ai-alert-bboxes");
    expect(frame.style.aspectRatio).toBe("640 / 360");
    expect(frame.textContent).toContain("cell phone 87%"); // boxes stay on top
    // alertItem() has detectionCount 3 and (older backend) no
    // firstDetections → boxes are from a newer frame, and it says so.
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "frame from the first detection; boxes show the latest detection"
    );
  });

  it("over a photo it draws the FIRST detection's boxes, not the latest", async () => {
    alertsMock.mockResolvedValue({
      items: [
        alertItem({
          alertId: 1,
          detectionCount: 4,
          latestDetections: [
            { classId: 67, label: "cell phone", confidence: 0.6, bbox: [0.7, 0.7, 0.9, 0.9] },
          ],
          firstDetections: [
            { classId: 67, label: "cell phone", confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.6] },
          ],
        }),
      ],
      nextCursor: null,
    });
    evidenceMock.mockResolvedValue([snapshotItem()]);
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/snap.jpg",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    renderFeed(5);
    await screen.findByTestId("ai-alert-snapshot");
    const frame = screen.getByTestId("ai-alert-bboxes");
    const box = frame.querySelector<HTMLElement>("div.absolute")!;
    expect(box.style.left).toBe("10%");
    expect(box.style.top).toBe("20%");
    expect(frame.textContent).toContain("cell phone 95%");
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "frame and boxes from the first detection"
    );
  });

  it("without a photo the latest boxes are shown even if firstDetections exist", async () => {
    alertsMock.mockResolvedValue({
      items: [
        alertItem({
          alertId: 1,
          latestDetections: [
            { classId: 67, label: "cell phone", confidence: 0.6, bbox: [0.7, 0.7, 0.9, 0.9] },
          ],
          firstDetections: [
            { classId: 67, label: "cell phone", confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.6] },
          ],
        }),
      ],
      nextCursor: null,
    });
    renderFeed(5);
    const frame = await screen.findByTestId("ai-alert-bboxes");
    expect(frame.querySelector<HTMLElement>("div.absolute")!.style.left).toBe("70%");
  });

  it("a single-detection alert says photo and boxes are the same frame", async () => {
    alertsMock.mockResolvedValue({
      items: [alertItem({ alertId: 1, detectionCount: 1 })],
      nextCursor: null,
    });
    evidenceMock.mockResolvedValue([snapshotItem()]);
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/snap.jpg",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    renderFeed(5);
    await screen.findByTestId("ai-alert-snapshot");
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "the same frame used for detection"
    );
  });

  it("an alert without a snapshot keeps the dark frame and mints no URL", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1 })], nextCursor: null });
    evidenceMock.mockResolvedValue([snapshotItem({ alertId: 99 })]);
    renderFeed(5);
    await screen.findByTestId("ai-alert-bboxes");
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("ai-alert-snapshot")).toBeNull();
    expect(evidenceUrlMock).not.toHaveBeenCalled();
  });

  it("an evidence fetch failure never breaks the feed", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1 })], nextCursor: null });
    evidenceMock.mockRejectedValue(new Error("403"));
    renderFeed(5);
    expect((await screen.findAllByTestId("ai-alert-card")).length).toBe(1);
    expect(screen.queryByTestId("ai-alert-snapshot")).toBeNull();
  });

  it("a LATER live frame (held frame unavailable) is never captioned as the detection frame", async () => {
    alertsMock.mockResolvedValue({
      items: [
        alertItem({
          alertId: 1,
          latestDetections: [
            { classId: 67, label: "cell phone", confidence: 0.6, bbox: [0.7, 0.7, 0.9, 0.9] },
          ],
          firstDetections: [
            { classId: 67, label: "cell phone", confidence: 0.95, bbox: [0.1, 0.2, 0.3, 0.6] },
          ],
        }),
      ],
      nextCursor: null,
    });
    // firstDetectedAt 08:00:00 — this photo was taken 30s later.
    evidenceMock.mockResolvedValue([snapshotItem({ capturedAt: "2026-11-15T08:00:30Z" })]);
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/late.jpg",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    renderFeed(5);
    await screen.findByTestId("ai-alert-snapshot");
    const caption = screen.getByTestId("ai-alert-card").textContent ?? "";
    expect(caption).toContain("not the frame used for detection");
    expect(caption).not.toContain("the same frame used for detection");
    // Boxes of the opening frame are NOT drawn over an unrelated photo.
    const box = screen.getByTestId("ai-alert-bboxes").querySelector<HTMLElement>("div.absolute")!;
    expect(box.style.left).toBe("70%");
  });

  it("a FULL snapshot page without this alert → the card looks its own snapshot up by alertId", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1, detectionCount: 1 })], nextCursor: null });
    const others = Array.from({ length: 100 }, (_, i) =>
      snapshotItem({ evidenceId: `o-${i}`, alertId: 1000 + i })
    );
    evidenceMock.mockImplementation(async (_sid, params) =>
      params?.alertId === 1 ? [snapshotItem({ evidenceId: "own" })] : others
    );
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/own.jpg",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    renderFeed(5);
    const img = (await screen.findByTestId("ai-alert-snapshot")) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("http://minio.test/own.jpg");
    expect(evidenceMock).toHaveBeenCalledWith(5, { kind: "SNAPSHOT", alertId: 1, limit: 10 });
    expect(evidenceUrlMock).toHaveBeenCalledWith(5, "own");
  });

  it("a page that is NOT full never triggers per-alert lookups", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1 })], nextCursor: null });
    evidenceMock.mockResolvedValue([snapshotItem({ alertId: 99 })]);
    renderFeed(5);
    await screen.findByTestId("ai-alert-bboxes");
    await act(async () => {
      await Promise.resolve();
    });
    expect(evidenceMock.mock.calls.every((c) => c[1]?.alertId == null)).toBe(true);
  });

  it("a snapshot whose URL cannot be minted claims no photo", async () => {
    alertsMock.mockResolvedValue({ items: [alertItem({ alertId: 1 })], nextCursor: null });
    evidenceMock.mockResolvedValue([snapshotItem()]);
    evidenceUrlMock.mockRejectedValue(new Error("403"));
    renderFeed(5);
    await screen.findByTestId("ai-alert-bboxes");
    await waitFor(() => expect(evidenceUrlMock).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("ai-alert-snapshot")).toBeNull();
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "no evidence image is available for this alert"
    );
    expect(screen.getByTestId("ai-alert-card").textContent).not.toContain("Evidence image submitted by the student's device");
  });

  it("a snapshot shows even when the alert carries no boxes", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    evidenceUrlMock.mockResolvedValue({
      url: "http://minio.test/s.jpg",
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
    render(
      <QueryClientProvider client={client}>
        <AiAlertCard
          alert={alertItem({ latestDetections: null })}
          sessionId={5}
          snapshot={snapshotItem()}
        />
      </QueryClientProvider>
    );
    expect(await screen.findByTestId("ai-alert-snapshot")).toBeTruthy();
    expect(screen.getByTestId("ai-alert-bboxes")).toBeTruthy();
  });
});
