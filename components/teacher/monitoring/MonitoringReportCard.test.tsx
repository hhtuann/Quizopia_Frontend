// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitoringReportCard } from "./MonitoringReportCard";
import {
  formatCoverageRatio,
  isReportEvidencePlayable,
  sortTypeCounts,
} from "./MonitoringReportView";
import { fetchRecordingUrl } from "@/lib/api/evidence";
import type { AttemptMonitoringReport } from "@/lib/api/monitoring-report";
import type { SessionAttemptItem } from "@/lib/api/monitoring";

/**
 * P4-E report card (design §3.6/§4): picker → fetch → the shared renderer
 * with every report group, three separated AI stat groups, EXPIRED evidence
 * rows metadata-only (no play affordance) and the disclaimer rendered
 * verbatim. Query hooks + REST mocked (msw-free).
 */

vi.mock("@/lib/api/evidence", () => ({
  fetchRecordingUrl: vi.fn(),
}));

vi.mock("@/lib/api/monitoring-report", () => ({
  getAttemptMonitoringReport: vi.fn(),
}));

vi.mock("@/hooks/queries/use-exam-sessions", () => ({
  useSessionRosterQuery: () => ({
    data: [{ userId: 42, studentProfileId: 1, studentCode: "STU1", displayName: "An" }],
  }),
}));

vi.mock("@/hooks/queries/use-monitoring", () => ({
  useSessionAttemptsQuery: () => ({
    data: {
      attempts: [
        {
          attemptId: 7,
          userId: 42,
          attemptNumber: 1,
          status: "SUBMITTED",
          startedAt: "2026-11-17T08:00:00Z",
          deadlineAt: "2026-11-17T09:00:00Z",
          submittedAt: "2026-11-17T08:42:00Z",
        } satisfies SessionAttemptItem,
      ],
    },
  }),
}));

import { getAttemptMonitoringReport } from "@/lib/api/monitoring-report";

const reportMock = vi.mocked(getAttemptMonitoringReport);

function report(
  overrides: Partial<AttemptMonitoringReport> = {}
): AttemptMonitoringReport {
  return {
    attempt: {
      attemptId: 7,
      sessionId: 1,
      sessionTitle: "Sess",
      sessionCode: "SES1",
      studentUserId: 42,
      studentName: "An",
      attemptNumber: 1,
      attemptStatus: "SUBMITTED",
      startedAt: "2026-11-17T08:00:00Z",
      deadlineAt: "2026-11-17T09:00:00Z",
      submittedAt: "2026-11-17T08:42:00Z",
    },
    policy: {
      monitoringEnabled: true,
      aiDetectionEnabled: true,
      activityTrackingEnabled: true,
      snapshotsEnabled: true,
      fullRecordingEnabled: false,
      clipsEnabled: true,
            mediaRetentionDays: 30,
      activityRetentionDays: 90,
    },
    monitoringWindow: {
      from: "2026-11-17T08:00:00Z",
      to: "2026-11-17T08:42:00Z",
      minutes: 42,
    },
    activity: {
      totalEvents: 120,
      answerAccepted: 18,
      distinctQuestionsAnswered: 9,
      browser: {
        tabHidden: 2,
        tabVisible: 2,
        focusLost: 3,
        focusGained: 3,
        pageReload: 1,
        connectionLost: 1,
      },
      byType: [{ type: "TAB_HIDDEN", count: 2 }, { type: "ANSWER_SELECTED", count: 18 }],
    },
    camera: {
      neverConnected: false,
      connectedPeriods: [{ from: "2026-11-17T08:01:00Z", to: "2026-11-17T08:42:00Z" }],
      disconnectPeriods: [],
      monitoringGaps: 1,
      lastEvent: "CAMERA_RECONNECTED",
    },
    recording: {
      mode: "ROLLING",
      segments: [
        {
          jobId: "job-1",
          status: "COMPLETE",
          startedAt: "2026-11-17T08:10:00Z",
          endedAt: "2026-11-17T08:10:30Z",
          bytes: 936000,
          durationMs: 30000,
          objectDeleted: false,
          playbackRef: "/api/exam-sessions/5/recordings/job-1/url",
          expiresAt: "2026-12-17T00:00:00Z",
        },
      ],
      gaps: [{ from: "2026-11-17T08:10:40Z", to: "2026-11-17T08:10:52.4Z", seconds: 12.4 }],
      coverageRatio: 0.97,
    },
    ai: {
      rawDetections: 41,
      quarantined: 2,
      groupedAlerts: 3,
      openAlerts: 0,
      closedAlerts: 3,
      reviewedAlerts: 2,
      unreviewedAlerts: 1,
      falsePositives: 1,
      models: [
        {
          modelId: "yolo26s",
          modelVersion: "8.4.64-onnx",
          provenance: "CLIENT_MODEL",
          runtime: "ORT_WEB_WASM",
          detections: 41,
        },
      ],
      limitsNote:
        "Browser-side ONNX inference, thresholds 0.5; observations only — never a verdict.",
    },
    evidence: [
      {
        evidenceId: "ev-1",
        kind: "SNAPSHOT",
        status: "AVAILABLE",
        provenance: "CLIENT_CAPTURE",
        capturedAt: "2026-11-17T08:20:00Z",
        windowStart: null,
        windowEnd: null,
        bytes: 123,
        sha256: "abc",
        expiresAt: "2026-12-17T00:00:00Z",
        alertId: 9,
        playbackRef: "/api/exam-sessions/1/evidence/ev-1/url",
      },
      {
        evidenceId: "ev-2",
        kind: "CLIP",
        status: "EXPIRED",
        provenance: "ROLLING_BUFFER",
        capturedAt: "2026-11-17T08:21:00Z",
        windowStart: "2026-11-17T08:20:00Z",
        windowEnd: "2026-11-17T08:22:00Z",
        bytes: 456,
        sha256: "def",
        expiresAt: "2026-11-18T00:00:00Z",
        alertId: 9,
        playbackRef: null,
      },
    ],
    reviews: [
      {
        reviewId: 1,
        alertId: 9,
        action: "FALSE_POSITIVE",
        note: "sai báo động",
        reviewerName: "Te",
        reviewedAt: "2026-11-17T09:00:00Z",
        version: 1,
      },
    ],
    retention: { mediaRetentionDays: 30, activityRetentionDays: 90, asOf: "2026-11-17T09:30:00Z" },
    disclaimer:
      "Monitoring observations only. No automated misconduct verdict; human review required.",
    ...overrides,
  };
}

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MonitoringReportCard sessionId={5} examId={2} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reportMock.mockResolvedValue(report());
});

afterEach(cleanup);

describe("MonitoringReportCard", () => {
  it("shows the empty picker state until an attempt is selected", () => {
    renderCard();
    expect(
      screen.getByText("Select a participant to view their monitoring report.")
    ).not.toBeNull();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("fetches the report for the selected attempt and renders all §3.6 groups", async () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });

    await waitFor(() => expect(reportMock).toHaveBeenCalledWith(7));
    const view = await screen.findByTestId("monitoring-report-view");

    // Every group heading renders.
    for (const heading of [
      "Monitoring report",
      "Monitoring policy",
      "Activity",
      "Camera",
      "Recording",
      "AI observations",
      "Evidence",
      "Teacher reviews",
      "Retention",
    ]) {
      expect(view.textContent).toContain(heading);
    }
    // Disclaimer verbatim (never a verdict).
    expect(view.textContent).toContain(
      "Monitoring observations only. No automated misconduct verdict; human review required."
    );
    // Three separated stat groups.
    expect(view.textContent).toContain("Detections");
    expect(view.textContent).toContain("Alerts");
    expect(view.textContent).toContain("Reviews");
    expect(view.textContent).toContain("97%");
    // Recording gaps list.
    expect(view.textContent).toContain("12.4s");
    // Model provenance row.
    expect(view.textContent).toContain("yolo26s@8.4.64-onnx");
    expect(view.textContent).toContain("ORT_WEB_WASM");
  });

  it("renders an Open affordance only for playable evidence (EXPIRED is metadata-only)", async () => {
    renderCard();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });

    const rows = await screen.findAllByTestId("report-evidence-row");
    const expired = rows.find((row) => row.dataset.status === "EXPIRED");
    const available = rows.find((row) => row.dataset.status === "AVAILABLE");
    expect(expired?.textContent).toContain("expired — metadata only");
    expect(expired?.querySelector("button")).toBeNull();
    expect(available?.querySelector("button")?.textContent).toBe("Open");
  });

  it("states camera absence honestly when never connected", async () => {
    reportMock.mockResolvedValue(
      report({
        camera: {
          neverConnected: true,
          connectedPeriods: [],
          disconnectPeriods: [],
          monitoringGaps: 0,
          lastEvent: null,
        },
      })
    );
    renderCard();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });
    expect(
      await screen.findByText(
        /Camera was never connected during this attempt — no camera coverage/
      )
    ).not.toBeNull();
  });

  it("shows the failed state with retry", async () => {
    reportMock.mockRejectedValue({ kind: "http", status: 500, message: "boom", raw: null });
    renderCard();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });
    expect(
      await screen.findByText("Couldn't load the monitoring report.")
    ).not.toBeNull();
  });

  it("links to the printable route once an attempt is selected", () => {
    renderCard();
    expect(screen.queryByText("Open printable report")).toBeNull();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });
    const link = screen.getByText("Open printable report").closest("a");
    expect(link?.getAttribute("href")).toBe("/exams/2/sessions/5/monitoring-report/7");
  });
});

describe("report formatting helpers (pure)", () => {
  it("formatCoverageRatio renders a percentage and guards absence", () => {
    expect(formatCoverageRatio(0.97)).toBe("97%");
    expect(formatCoverageRatio(0)).toBe("0%");
    expect(formatCoverageRatio(null)).toBe("—");
    expect(formatCoverageRatio(Number.NaN)).toBe("—");
  });

  it("isReportEvidencePlayable requires a playbackRef AND a servable status", () => {
    expect(
      isReportEvidencePlayable({
        evidenceId: "e",
        kind: "SNAPSHOT",
        status: "AVAILABLE",
        provenance: "CLIENT_CAPTURE",
        capturedAt: null,
        windowStart: null,
        windowEnd: null,
        bytes: null,
        sha256: null,
        expiresAt: null,
        alertId: null,
        playbackRef: "/api/x",
      })
    ).toBe(true);
    expect(
      isReportEvidencePlayable({
        evidenceId: "e",
        kind: "SNAPSHOT",
        status: "EXPIRED",
        provenance: "CLIENT_CAPTURE",
        capturedAt: null,
        windowStart: null,
        windowEnd: null,
        bytes: null,
        sha256: null,
        expiresAt: null,
        alertId: null,
        playbackRef: null,
      })
    ).toBe(false);
    // AVAILABLE status but no playbackRef → backend says unplayable.
    expect(
      isReportEvidencePlayable({
        evidenceId: "e",
        kind: "SNAPSHOT",
        status: "AVAILABLE",
        provenance: "CLIENT_CAPTURE",
        capturedAt: null,
        windowStart: null,
        windowEnd: null,
        bytes: null,
        sha256: null,
        expiresAt: null,
        alertId: null,
        playbackRef: null,
      })
    ).toBe(false);
  });

  it("sortTypeCounts orders by count desc, ties alphabetical", () => {
    expect(
      sortTypeCounts([
        { type: "ANSWER_SELECTED", count: 18 },
        { type: "TAB_HIDDEN", count: 18 },
        { type: "PAGE_RELOADED", count: 1 },
      ])
    ).toEqual([
      ["ANSWER_SELECTED", 18],
      ["TAB_HIDDEN", 18],
      ["PAGE_RELOADED", 1],
    ]);
  });

  it("F05: clicking Play mints the audited recording URL and mounts the player", async () => {
    vi.mocked(fetchRecordingUrl).mockResolvedValue({
      url: "http://localhost:9000/quizopia-evidence/seg.mp4?X=1",
      expiresAt: "2026-11-17T09:00:00Z",
    });
    renderCard();
    fireEvent.change(screen.getByLabelText("Participant attempt"), {
      target: { value: "7" },
    });
    await screen.findByTestId("monitoring-report-view");
    // COMPLETE+playable fixture renders exactly one enabled Play control
    const play = screen.getByRole("button", { name: "Play" });
    expect((play as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(play);
    await waitFor(() => expect(fetchRecordingUrl).toHaveBeenCalled());
    await waitFor(() => {
      const video = document.querySelector("video");
      expect(video).not.toBeNull();
      expect(video?.getAttribute("src")).toContain("seg.mp4");
    });
  });
});
