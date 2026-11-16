// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isMonitoringDashboardActivity,
  MonitoringDashboard,
  REVIEW_STATUS_LABEL_EN,
} from "./MonitoringDashboard";
import type {
  MonitoringOverviewResponse,
  MonitoringParticipantItem,
  MonitoringParticipantsResponse,
} from "@/lib/api/monitoring-dashboard";
import type { RealtimeEventEnvelope } from "@/lib/realtime/types";

/**
 * P4-E dashboard: overview KPI render, participants rollup with per-signal
 * chips, row selection wiring, cursor Load-more, filters driving the query
 * key (params), and distinct loading/empty/failed/offline states. REST layer
 * mocked at the api module (msw-free).
 */

import type * as Api from "@/lib/api/monitoring-dashboard";

vi.mock("@/lib/api/monitoring-dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    getMonitoringOverview: vi.fn(),
    getMonitoringParticipants: vi.fn(),
  };
});

import {
  getMonitoringOverview,
  getMonitoringParticipants,
} from "@/lib/api/monitoring-dashboard";

const overviewMock = vi.mocked(getMonitoringOverview);
const participantsMock = vi.mocked(getMonitoringParticipants);

function overview(
  overrides: Partial<MonitoringOverviewResponse> = {}
): MonitoringOverviewResponse {
  return {
    sessionId: 5,
    asOf: "2026-11-17T08:30:00Z",
    monitoringEnabled: true,
    attempts: { total: 3, inProgress: 2, submitted: 1, graded: 0 },
    camera: {
      policyRequired: true,
      connected: 2,
      reconnecting: 0,
      idle: 1,
      revoked: 0,
      },
    ai: {
      enabled: true,
      openAlerts: 2,
      closedAlerts: 1,
      unreviewedAlerts: 3,
      lastDetectionAt: "2026-11-17T08:29:00Z",
    },
    recording: {
      fullRecordingEnabled: false,
      rollingBufferActive: true,
      activeJobs: 1,
      completeJobs: 2,
      failedJobs: 0,
    },
    evidence: { available: 5, partial: 1, pending: 0, failed: 0, expired: 0 },
    ...overrides,
  };
}

function participant(
  overrides: Partial<MonitoringParticipantItem> = {}
): MonitoringParticipantItem {
  return {
    attemptId: 7,
    userId: 42,
    displayName: "An",
    attemptNumber: 1,
    attemptStatus: "IN_PROGRESS",
    startedAt: "2026-11-17T08:00:00Z",
    deadlineAt: "2026-11-17T09:00:00Z",
    submittedAt: null,
    lastActivityAt: "2026-11-17T08:28:00Z",
    camera: {
      state: "CONNECTED",
      connectedSince: "2026-11-17T08:01:00Z",
      lastVerifiedAt: "2026-11-17T08:28:00Z",
      mediaIdentity: "identity_a",
    },
    ai: { lastDetectionAt: null, openAlerts: 1, totalAlerts: 2, unreviewedAlerts: 2 },
    recording: { mode: "ROLLING", activeJobs: 1, completeJobs: 2, failedJobs: 0 },
    evidence: { snapshots: 1, clips: 1 },
    reviewStatus: "UNREVIEWED",
    ...overrides,
  };
}

function renderDashboard(
  selectedAttemptId: number | null = null,
  onSelectAttempt = vi.fn()
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <MonitoringDashboard
        sessionId={5}
        selectedAttemptId={selectedAttemptId}
        onSelectAttempt={onSelectAttempt}
      />
    </QueryClientProvider>
  );
  return { container, client, onSelectAttempt };
}

beforeEach(() => {
  vi.clearAllMocks();
  overviewMock.mockResolvedValue(overview());
  participantsMock.mockResolvedValue({
    sessionId: 5,
    items: [participant()],
    nextCursor: null,
  } satisfies MonitoringParticipantsResponse);
});

afterEach(cleanup);

describe("isMonitoringDashboardActivity (STOMP gating)", () => {
  const envelope = (activityType: string | null): RealtimeEventEnvelope =>
    ({
      eventId: "e",
      eventType: "ATTEMPT_ACTIVITY",
      occurredAt: "2026-11-17T08:00:00Z",
      serverTime: "2026-11-17T08:00:00Z",
      activityType,
    }) as RealtimeEventEnvelope;

  it("matches the monitoring-relevant ping kinds", () => {
    for (const type of [
      "AI_ALERT_RAISED",
      "EVIDENCE_SNAPSHOT_STORED",
      "RECORDING_STARTED",
      "CAMERA_CONNECTED",
      "MONITORING_GAP",
      "ALERT_REVIEW_RECORDED",
    ]) {
      expect(isMonitoringDashboardActivity(envelope(type))).toBe(true);
    }
  });

  it("ignores answer-level activity and absent types", () => {
    expect(isMonitoringDashboardActivity(envelope("ANSWER_SELECTED"))).toBe(false);
    expect(isMonitoringDashboardActivity(envelope(null))).toBe(false);
  });
});

describe("MonitoringDashboard overview", () => {
  it("renders KPI cards from the overview with an aria-live asOf", async () => {
    renderDashboard();
    await screen.findByText("Cameras connected");
    const dashboard = screen.getByTestId("monitoring-dashboard");
    expect(dashboard.textContent).toContain("Submitted");
    expect(dashboard.textContent).toContain("Cameras connected");
    expect(dashboard.textContent).toContain("Unreviewed alerts");
    expect(dashboard.textContent).toContain("Evidence ready");
    expect(dashboard.innerHTML).toContain('aria-live="polite"');
    // Honest counts, straight from the payload.
    expect(dashboard.textContent).toContain("3");
  });

  it("renders the failed state with a retry when the overview query rejects", async () => {
    overviewMock.mockRejectedValue({ kind: "http", status: 500, message: "boom", raw: null });
    renderDashboard();
    expect(
      await screen.findByText("Couldn't load the monitoring overview.")
    ).not.toBeNull();
  });
});

describe("MonitoringDashboard participants", () => {
  it("renders one row per attempt with per-signal chips", async () => {
    renderDashboard();
    const row = await screen.findByTestId("monitoring-participant-row");
    expect(row.textContent).toContain("An");
    expect(row.textContent).toContain("IN_PROGRESS");
    expect(row.textContent).toContain("Connected");
    expect(row.textContent).toContain("2 unreviewed");
    expect(row.textContent).toContain("ROLLING");
    expect(row.textContent).toContain("1 snapshots · 1 clips");
    expect(row.textContent).toContain("Unreviewed");
  });

  it("selects the attempt on row click AND on the row button (drilldown wiring)", async () => {
    const { onSelectAttempt } = renderDashboard();
    const row = await screen.findByTestId("monitoring-participant-row");
    fireEvent.click(row);
    expect(onSelectAttempt).toHaveBeenCalledWith(7);
    onSelectAttempt.mockClear();
    fireEvent.click(
      screen.getByRole("button", { name: /An/i })
    );
    expect(onSelectAttempt).toHaveBeenCalledWith(7);
  });

  it("marks the selected row", async () => {
    const { container } = renderDashboard(7);
    await screen.findByTestId("monitoring-participant-row");
    const selected = container.querySelector('[data-attempt-id="7"]');
    expect(selected?.className).toContain("bg-[#0052FF]/5");
  });

  it("loads the next cursor page on Load more", async () => {
    participantsMock.mockResolvedValueOnce({
      sessionId: 5,
      items: [participant({ attemptId: 7 })],
      nextCursor: "7",
    } satisfies MonitoringParticipantsResponse);
    participantsMock.mockResolvedValueOnce({
      sessionId: 5,
      items: [participant({ attemptId: 3, displayName: "Binh", attemptNumber: 2 })],
      nextCursor: null,
    } satisfies MonitoringParticipantsResponse);
    renderDashboard();

    const loadMore = await screen.findByRole("button", { name: "Load more" });
    fireEvent.click(loadMore);
    await screen.findByText("Binh");
    expect(participantsMock).toHaveBeenLastCalledWith(5, expect.anything(), "7");
    const rows = document.querySelectorAll('[data-testid="monitoring-participant-row"]');
    expect(Array.from(rows).some((r) => r.textContent?.includes("An"))).toBe(true);
  });

  it("drives the query with the camera filter (filters feed the key)", async () => {
    renderDashboard();
    await screen.findByTestId("monitoring-participant-row");

    fireEvent.change(screen.getByLabelText("Camera"), {
      target: { value: "RECONNECTING" },
    });
    await waitFor(() =>
      expect(participantsMock).toHaveBeenLastCalledWith(
        5,
        expect.objectContaining({ cameraState: "RECONNECTING" }),
        undefined
      )
    );
  });

  it("shows the filtered empty state with Clear filters", async () => {
    participantsMock.mockResolvedValue({
      sessionId: 5,
      items: [],
      nextCursor: null,
    } satisfies MonitoringParticipantsResponse);
    renderDashboard();
    await screen.findByText("No participant attempts yet.");
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();

    fireEvent.change(screen.getByLabelText("Attempt status"), {
      target: { value: "SUBMITTED" },
    });
    await screen.findByText("No participants match the current filters.");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(participantsMock).toHaveBeenLastCalledWith(
        5,
        expect.objectContaining({ status: "ALL" }),
        undefined
      )
    );
  });

  it("renders distinct failed vs offline error states", async () => {
    participantsMock.mockRejectedValueOnce({
      kind: "network",
      message: "offline",
      raw: null,
    });
    renderDashboard();
    expect(
      await screen.findByText(/Connection lost — participant data may be stale./)
    ).not.toBeNull();

    cleanup();
    participantsMock.mockRejectedValueOnce({
      kind: "http",
      status: 500,
      message: "boom",
      raw: null,
    });
    renderDashboard();
    expect(await screen.findByText("Couldn't load participants.")).not.toBeNull();
  });

  it("renders the loading state before data arrives", () => {
    participantsMock.mockReturnValue(new Promise(() => {}));
    overviewMock.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText("Loading participants…")).not.toBeNull();
    expect(screen.getByText("Loading overview…")).not.toBeNull();
  });
});


describe("REVIEW_STATUS_LABEL_EN", () => {
  it("labels every review status (no raw enum leakage)", () => {
    expect(REVIEW_STATUS_LABEL_EN.UNREVIEWED).toBe("Unreviewed");
    expect(REVIEW_STATUS_LABEL_EN.REVIEWED_NO_CONCLUSION).toBe("No conclusion");
  });
});
