// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MonitoringReportPrintPage from "./page";

/**
 * P4-E printable route: fetches by path param, renders the shared report
 * view, keeps controls out of print (print:hidden) and stays keyboard
 * accessible (real button/link elements). REST + navigation mocked.
 */

vi.mock("next/navigation", () => ({
  useParams: () => ({ examId: "2", sessionId: "5", attemptId: "7" }),
}));

vi.mock("@/lib/api/monitoring-report", () => ({
  getAttemptMonitoringReport: vi.fn(),
}));

import { getAttemptMonitoringReport } from "@/lib/api/monitoring-report";
import type { AttemptMonitoringReport } from "@/lib/api/monitoring-report";

const reportMock = vi.mocked(getAttemptMonitoringReport);

function minimalReport(): AttemptMonitoringReport {
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
      totalEvents: 10,
      answerAccepted: 2,
      distinctQuestionsAnswered: 2,
      browser: {
        tabHidden: 1,
        tabVisible: 1,
        focusLost: 0,
        focusGained: 0,
        pageReload: 0,
        connectionLost: 0,
      },
      byType: [],
    },
    camera: {
      neverConnected: false,
      connectedPeriods: [],
      disconnectPeriods: [],
      monitoringGaps: 0,
      lastEvent: null,
    },
    recording: { mode: "NONE", segments: [], gaps: [], coverageRatio: null },
    ai: {
      rawDetections: 0,
      quarantined: 0,
      groupedAlerts: 0,
      openAlerts: 0,
      closedAlerts: 0,
      reviewedAlerts: 0,
      unreviewedAlerts: 0,
      falsePositives: 0,
      models: [],
      limitsNote: null,
    },
    evidence: [],
    reviews: [],
    retention: { mediaRetentionDays: 30, activityRetentionDays: 90, asOf: "2026-11-17T09:30:00Z" },
    disclaimer:
      "Monitoring observations only. No automated misconduct verdict; human review required.",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MonitoringReportPrintPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  reportMock.mockResolvedValue(minimalReport());
});

afterEach(cleanup);

describe("MonitoringReportPrintPage", () => {
  it("fetches by the path attemptId and renders the shared report view", async () => {
    renderPage();
    await waitFor(() => expect(reportMock).toHaveBeenCalledWith(7));
    const view = await screen.findByTestId("monitoring-report-view");
    expect(view.textContent).toContain("Monitoring observations only.");
  });

  it("triggers window.print from the Print button", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    await screen.findByTestId("monitoring-report-view");
    fireEvent.click(screen.getByRole("button", { name: "Print report" }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("links back to the session page (breadcrumb)", async () => {
    renderPage();
    const back = screen.getByRole("link", { name: /Back to session/i });
    expect(back.getAttribute("href")).toBe("/exams/2/sessions/5");
  });

  it("shows the honest error state with retry", async () => {
    reportMock.mockRejectedValue({ kind: "http", status: 500, message: "boom", raw: null });
    renderPage();
    expect(
      await screen.findByText("Couldn't load the monitoring report.")
    ).not.toBeNull();
  });

  it("renders the loading state first", () => {
    reportMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText("Loading report…")).not.toBeNull();
  });
});
