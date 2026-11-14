// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAlertCard, AiAlertFeed, isAiAlertActivity, mergeAlertItems } from "./AiAlertFeed";
import type { AiAlertItem } from "@/lib/api/ai-detections";
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

import { getSessionAiAlerts } from "@/lib/api/ai-detections";

const alertsMock = vi.mocked(getSessionAiAlerts);

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
    expect(feed.textContent).toContain("Quan sát bằng AI — không tự động kết luận vi phạm.");
    const card = await screen.findByTestId("ai-alert-card");
    expect(card.textContent).toContain("Nguyen Van A");
    expect(card.textContent).toContain("Phát hiện điện thoại");
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
    // Honesty label: boxes only, no stored image (P4-D).
    expect(canvas.textContent).toContain("cell phone 90%");
    expect(screen.getByTestId("ai-alert-card").textContent).toContain(
      "bbox từ khung phân tích — không lưu ảnh (P4-D)"
    );
  });

  it("shows the empty state when no alerts exist", async () => {
    alertsMock.mockResolvedValue({ items: [], nextCursor: null });
    renderFeed();
    const feed = await screen.findByText("Chưa có cảnh báo AI.");
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
  it("labels each VN alert type", () => {
    const types: Array<[AiAlertItem["alertType"], string]> = [
      ["PHONE_DETECTED", "Phát hiện điện thoại"],
      ["SCREEN_DETECTED", "Phát hiện màn hình phụ"],
      ["MULTIPLE_PERSONS_DETECTED", "Nhiều người trong khung hình"],
      ["PERSON_NOT_VISIBLE", "Không thấy người làm bài"],
    ];
    for (const [alertType, label] of types) {
      const { container, unmount } = render(
        <AiAlertCard alert={alertItem({ alertType, latestDetections: null })} />
      );
      expect(container.textContent).toContain(label);
      unmount();
    }
  });

  it("shows the WORKER chip for worker-verified provenance", () => {
    const { container } = render(
      <AiAlertCard
        alert={alertItem({ provenance: "WORKER_VERIFIED", latestDetections: null })}
      />
    );
    expect(container.textContent).toContain("WORKER");
  });

  it("renders without detections (no bbox area)", () => {
    const { container } = render(
      <AiAlertCard alert={alertItem({ latestDetections: null })} />
    );
    expect(container.querySelector('[data-testid="ai-alert-bboxes"]')).toBeNull();
  });
});
