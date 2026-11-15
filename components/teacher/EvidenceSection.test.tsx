// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EvidenceSection,
  isEvidenceActivity,
  parseCoverageGaps,
} from "./EvidenceSection";
import type { AiAlertItem } from "@/lib/api/ai-detections";
import type { EvidenceItem } from "@/lib/api/evidence";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-D teacher evidence panel (issues #91–#94): per-alert snapshots with the
 * honest CLIENT_CAPTURE label, the clip row state machine (PENDING /
 * AVAILABLE / PARTIAL + gaps / FAILED + NO_COVERAGE / EXPIRED) and the
 * EVIDENCE_/RECORDING_ ping predicate. REST fully mocked — no network.
 */

import type * as AiApi from "@/lib/api/ai-detections";
import type * as EvidenceApi from "@/lib/api/evidence";

vi.mock("@/lib/api/ai-detections", async (importOriginal) => {
  const actual = await importOriginal<typeof AiApi>();
  return { ...actual, getSessionAiAlerts: vi.fn() };
});

vi.mock("@/lib/api/evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof EvidenceApi>();
  return {
    ...actual,
    fetchSessionEvidence: vi.fn(),
    requestAlertClip: vi.fn(),
    fetchEvidenceUrl: vi.fn(),
  };
});

import { getSessionAiAlerts } from "@/lib/api/ai-detections";
import {
  fetchEvidenceUrl,
  fetchSessionEvidence,
  requestAlertClip,
} from "@/lib/api/evidence";

const alertsMock = vi.mocked(getSessionAiAlerts);
const evidenceMock = vi.mocked(fetchSessionEvidence);
const clipMock = vi.mocked(requestAlertClip);
const urlMock = vi.mocked(fetchEvidenceUrl);

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
    latestDetections: [],
    ...overrides,
  };
}

function evidenceItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    evidenceId: "11111111-0000-4000-8000-000000000001",
    attemptId: 10,
    alertId: 1,
    kind: "SNAPSHOT",
    status: "AVAILABLE",
    provenance: "CLIENT_CAPTURE",
    contentType: "image/jpeg",
    bytes: 12345,
    capturedAt: "2026-11-15T08:00:01Z",
    createdAt: "2026-11-15T08:00:02Z",
    expiresAt: "2026-12-15T08:00:02Z",
    ...overrides,
  };
}

function renderSection(sessionId = 5): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <EvidenceSection sessionId={sessionId} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  alertsMock.mockResolvedValue({ items: [alertItem()], nextCursor: null });
  urlMock.mockResolvedValue({
    url: "https://signed.example/evidence?sig=abc",
    expiresAt: "2026-11-15T09:00:00Z",
  });
});

afterEach(cleanup);

describe("parseCoverageGaps (pure)", () => {
  it("extracts the gaps array from the coverage JSON", () => {
    const coverage = JSON.stringify({
      windowStart: "2026-11-15T08:00:00Z",
      windowEnd: "2026-11-15T08:00:40Z",
      covered: [{ from: "x", to: "y", objectKey: "k" }],
      gaps: [{ from: "2026-11-15T08:00:10Z", to: "2026-11-15T08:00:15Z" }],
    });
    expect(parseCoverageGaps(coverage)).toEqual([
      { from: "2026-11-15T08:00:10Z", to: "2026-11-15T08:00:15Z" },
    ]);
  });

  it("tolerates missing gaps, malformed JSON and non-strings", () => {
    expect(parseCoverageGaps(null)).toEqual([]);
    expect(parseCoverageGaps(undefined)).toEqual([]);
    expect(parseCoverageGaps("{not json")).toEqual([]);
    expect(parseCoverageGaps(JSON.stringify({ covered: [] }))).toEqual([]);
    expect(parseCoverageGaps(JSON.stringify({ gaps: [{ from: 1, to: 2 }] }))).toEqual([]);
  });
});

describe("isEvidenceActivity", () => {
  const envelope = (activityType: string | null): RealtimeEventEnvelope =>
    ({
      eventId: "e",
      eventType: "ATTEMPT_ACTIVITY",
      occurredAt: "2026-11-15T08:00:00Z",
      serverTime: "2026-11-15T08:00:00Z",
      activityType,
    }) as RealtimeEventEnvelope;

  it("matches EVIDENCE_* and RECORDING_* activity types", () => {
    expect(isEvidenceActivity(envelope("EVIDENCE_SNAPSHOT_UPLOADED"))).toBe(true);
    expect(isEvidenceActivity(envelope("EVIDENCE_CLIP_READY"))).toBe(true);
    expect(isEvidenceActivity(envelope("RECORDING_STARTED"))).toBe(true);
  });

  it("ignores other activity types and absent type", () => {
    expect(isEvidenceActivity(envelope("CAMERA_CONNECTED"))).toBe(false);
    expect(isEvidenceActivity(envelope("AI_ALERT_RAISED"))).toBe(false);
    expect(isEvidenceActivity(envelope(null))).toBe(false);
  });
});

describe("EvidenceSection", () => {
  it("renders snapshot thumbnails with the honest CLIENT_CAPTURE label + signed URL", async () => {
    const snap = evidenceItem();
    evidenceMock.mockResolvedValue([snap]);

    renderSection();

    expect(await screen.findByTestId("evidence-snapshot")).not.toBeNull();
    expect(screen.getByText("Ảnh do máy thí sinh gửi")).not.toBeNull();
    const img = await screen.findByRole("img");
    expect(img.getAttribute("src")).toBe("https://signed.example/evidence?sig=abc");
    expect(evidenceMock).toHaveBeenCalledWith(5, { alertId: 1 });
    expect(urlMock).toHaveBeenCalledWith(5, snap.evidenceId);
    // Honesty: the panel never claims verification.
    expect(screen.getByText(/không tự động kết luận vi phạm/)).not.toBeNull();
  });

  it("no alerts yet → honest empty state, no evidence query", async () => {
    alertsMock.mockResolvedValue({ items: [], nextCursor: null });
    renderSection();

    expect(
      await screen.findByText("Chưa có cảnh báo nào để xem minh chứng.")
    ).not.toBeNull();
    expect(evidenceMock).not.toHaveBeenCalled();
  });

  it("no clip yet → 'Tạo clip' posts the clip request, then shows PENDING", async () => {
    const snap = evidenceItem();
    const pendingClip = evidenceItem({
      evidenceId: "22222222-0000-4000-8000-000000000002",
      kind: "CLIP",
      status: "PENDING",
      provenance: "ROLLING_BUFFER",
      capturedAt: undefined,
      contentType: undefined,
    });
    evidenceMock
      .mockResolvedValueOnce([snap])
      .mockResolvedValue([snap, pendingClip]);
    clipMock.mockResolvedValue(pendingClip);

    renderSection();
    const button = await screen.findByRole("button", { name: "Tạo clip" });
    fireEvent.click(button);

    await waitFor(() => expect(clipMock).toHaveBeenCalledWith(5, 1));
    expect(await screen.findByText("Đang trích xuất…")).not.toBeNull();
  });

  it("clip rejection (EVIDENCE_CLIP_REJECTED) → honest disabled-clips copy", async () => {
    evidenceMock.mockResolvedValue([]);
    clipMock.mockRejectedValue({
      kind: "api",
      status: 409,
      code: "EVIDENCE_CLIP_REJECTED",
      message: "clips disabled",
      raw: {},
    });

    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Tạo clip" }));

    expect(
      await screen.findByText("Clip đã bị tắt trong cấu hình giám sát của buổi thi.")
    ).not.toBeNull();
  });

  it("AVAILABLE clip → 'Xem clip' + video with the signed src", async () => {
    const clip = evidenceItem({
      evidenceId: "33333333-0000-4000-8000-000000000003",
      kind: "CLIP",
      status: "AVAILABLE",
      provenance: "FULL_RECORDING",
      windowStart: "2026-11-15T08:00:00Z",
      windowEnd: "2026-11-15T08:00:40Z",
    });
    evidenceMock.mockResolvedValue([clip]);

    renderSection();

    expect(await screen.findByText("Xem clip")).not.toBeNull();
    const video = await screen.findByTestId("evidence-clip-video");
    expect(video.getAttribute("src")).toBe("https://signed.example/evidence?sig=abc");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(urlMock).toHaveBeenCalledWith(5, clip.evidenceId);
  });

  it("PARTIAL clip → 'Clip một phần' + expandable gaps from coverage", async () => {
    const clip = evidenceItem({
      evidenceId: "44444444-0000-4000-8000-000000000004",
      kind: "CLIP",
      status: "PARTIAL",
      provenance: "ROLLING_BUFFER",
      coverage: JSON.stringify({
        windowStart: "2026-11-15T08:00:00Z",
        windowEnd: "2026-11-15T08:00:40Z",
        covered: [],
        gaps: [
          { from: "2026-11-15T08:00:10Z", to: "2026-11-15T08:00:15Z" },
          { from: "2026-11-15T08:00:20Z", to: "2026-11-15T08:00:30Z" },
        ],
      }),
    });
    evidenceMock.mockResolvedValue([clip]);

    renderSection();

    expect(await screen.findByText("Clip một phần")).not.toBeNull();
    expect(screen.queryByTestId("evidence-clip-gaps")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Xem khoảng trống" }));

    const gaps = await screen.findByTestId("evidence-clip-gaps");
    const rows = gaps.querySelectorAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Khoảng trống");
    expect(rows[0]!.textContent).toMatch(/Khoảng trống .+:10 → .+:15/);
  });

  it("FAILED clip → verbatim NO_COVERAGE honest text", async () => {
    const clip = evidenceItem({
      evidenceId: "55555555-0000-4000-8000-000000000005",
      kind: "CLIP",
      status: "FAILED",
      provenance: "ROLLING_BUFFER",
      error: "NO_COVERAGE",
    });
    evidenceMock.mockResolvedValue([clip]);

    renderSection();

    expect(
      await screen.findByText(
        "Không tạo được clip — Không có footage bao phủ thời điểm cảnh báo"
      )
    ).not.toBeNull();
  });

  it("EXPIRED clip → 'Đã hết hạn' and no URL fetch", async () => {
    const clip = evidenceItem({
      evidenceId: "66666666-0000-4000-8000-000000000006",
      kind: "CLIP",
      status: "EXPIRED",
      provenance: "ROLLING_BUFFER",
    });
    evidenceMock.mockResolvedValue([clip]);

    renderSection();

    expect(await screen.findByText("Đã hết hạn")).not.toBeNull();
    expect(urlMock).not.toHaveBeenCalled();
  });

  it("switches alerts via the chips (selected overrides newest)", async () => {
    alertsMock.mockResolvedValue({
      items: [alertItem({ alertId: 2, studentName: "Tran B" }), alertItem()],
      nextCursor: null,
    });
    evidenceMock.mockResolvedValue([]);

    renderSection();
    await screen.findByText("Chưa có minh chứng cho cảnh báo này.");
    expect(evidenceMock).toHaveBeenCalledWith(5, { alertId: 2 });
    fireEvent.click(screen.getByRole("button", { name: /#1 · Nguyen Van A/ }));
    await waitFor(() =>
      expect(evidenceMock).toHaveBeenLastCalledWith(5, { alertId: 1 })
    );
  });
});
