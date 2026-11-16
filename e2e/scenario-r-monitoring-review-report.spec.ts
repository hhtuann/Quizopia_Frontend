import { test, expect } from "@playwright/test";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";
import type { SmokeState } from "./helpers";

/**
 * Scenario R — P4-E unified monitoring dashboard, alert review & report
 * (issues #95/#96).
 *
 * Publishers: FIVE synthetic-camera Chromium contexts (fake devices =
 * SIMULATED media; real WebRTC publish through self-hosted LiveKit — the
 * five PHYSICAL webcams of P4-F #98 are NOT claimed here). AI detections
 * come from the P4-C fake detector (SIMULATED, labeled so by the app).
 *
 * R1 five publishers → teacher MonitoringDashboard: KPI row, participants
 *    table with separated signal chips, attempt drilldown (unified timeline
 *    incl. AI_ALERT_RAISED), alert review (FALSE_POSITIVE + note), review
 *    history, timeline ALERT_REVIEW_RECORDED, full RELOAD backfill.
 * R2 session close → per-attempt monitoring report (3-layer counts,
 *    evidence states, disclaimer) + printable route; foreign teacher 403.
 */
test.describe("Scenario R — monitoring dashboard, review & report", () => {
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });

  let sessionId = 0;
  let examId = 0;
  const students: Array<{ email: string; password: string; accessToken: string }> = [];

  test.beforeAll(async () => {
    examId = s.examId;
    const res = await apiJson<{ id: number }>(
      `/api/exams/${examId}/sessions`,
      s.teacher.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: `Smoke Monitoring Report Session ${Date.now()}`,
          startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
          maxAttempts: 1,
          visibility: "CLASS_RESTRICTED",
          classroomIds: [s.classroomId],
          monitoring: {
            monitoringEnabled: true,
            aiDetectionEnabled: true,
            activityTrackingEnabled: true,
            evidenceSnapshotsEnabled: true,
            fullRecordingEnabled: false,
            evidenceClipsEnabled: false,
          },
        }),
      }
    );
    expect(res.status, res.raw ?? "").toBeLessThan(300);
    sessionId = res.body!.id;
    await apiJson(`/api/exams/${examId}/sessions/${sessionId}/schedule`, s.teacher.accessToken, {
      method: "POST",
    });
    await apiJson(`/api/exams/${examId}/sessions/${sessionId}/open`, s.teacher.accessToken, {
      method: "POST",
    });

    for (let i = 1; i <= 4; i++) {
      const u = await registerVerifiedUser("STUDENT", `r-student-${i}-${Date.now()}`);
      const added = await apiJson(
        `/api/classrooms/${s.classroomId}/members`,
        s.teacher.accessToken,
        { method: "POST", body: JSON.stringify({ userIds: [u.id] }) }
      );
      expect(added.status, added.raw ?? "").toBeLessThan(300);
      students.push({ email: u.email, password: u.password, accessToken: u.accessToken });
    }
    students.unshift({
      email: s.student.email,
      password: s.student.password,
      accessToken: s.student.accessToken,
    });
  });

  /** SIMULATED phone detector (labeled by the app) + real camera publish. */
  async function monitoredAttemptFlow(page: Page, user: { email: string; password: string }) {
    await page.addInitScript(() => {
      const frame = {
        detections: [
          { classId: 0, label: "person", confidence: 0.86, bbox: [0.18, 0.05, 0.82, 0.95] },
          { classId: 67, label: "cell phone", confidence: 0.91, bbox: [0.52, 0.42, 0.86, 0.78] },
        ],
        frameWidth: 640,
        frameHeight: 480,
        processingMs: 42,
        runtime: "ORT_WEB_WASM",
        simulated: true,
      };
      const install = (): void => {
        const hooks = (window as unknown as {
          __quizopiaAi?: { setFakeDetector: (fn: unknown) => void };
        }).__quizopiaAi;
        if (hooks?.setFakeDetector) {
          hooks.setFakeDetector(() => ({ ...frame, capturedAt: Date.now() }));
        } else {
          setTimeout(install, 150);
        }
      };
      install();
    });
    await loginViaUi(page, user.email, user.password);
    await page.goto(`/sessions/${sessionId}`);
    const preflight = page.getByTestId("camera-preflight");
    await preflight.getByRole("button", { name: "Enable camera" }).click();
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start the attempt" }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 30_000 });
    return Number(new URL(page.url()).pathname.split("/")[2]);
  }

  test("R1 dashboard + review with reload backfill (5 synthetic-camera publishers)", async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    const contexts: BrowserContext[] = [];
    const attemptIds: number[] = [];
    for (const stu of students) {
      const ctx = await browser.newContext({ permissions: ["camera"] });
      contexts.push(ctx);
      attemptIds.push(await monitoredAttemptFlow(await ctx.newPage(), stu));
    }
    expect(attemptIds).toHaveLength(5);

    // Wait for at least one aggregated alert (SIMULATED detector output).
    const focusAttempt = attemptIds[0];
    await expect
      .poll(
        async () => {
          const alerts = await apiJson<{
            items: Array<{ attemptId: number; reviewStatus: string; alertId: number }>;
          }>(`/api/exam-sessions/${sessionId}/ai-alerts`, s.teacher.accessToken, {});
          return alerts.body?.items.filter((a) => a.attemptId === focusAttempt).length ?? 0;
        },
        { timeout: 120_000, intervals: [3_000] }
      )
      .toBeGreaterThan(0);

    // Teacher dashboard.
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
    await teacherPage.goto(`/exams/${examId}/sessions/${sessionId}`);
    const dashboard = teacherPage.getByTestId("monitoring-dashboard");
    await expect(dashboard).toBeVisible({ timeout: 30_000 });

    // Participants table: one row per attempt, signals separated.
    const rows = dashboard.getByTestId("monitoring-participant-row");
    await expect(rows).toHaveCount(5, { timeout: 30_000 });

    // Overview KPIs rendered (5 in progress) — scoped to the "In progress"
    // KPI card (its value <p role=status>), not any "5" on the page.
    const kpiValue = dashboard
      .getByText("In progress")
      .locator("xpath=ancestor::div[1]")
      .getByRole("status");
    await expect(kpiValue).toHaveText("5", { timeout: 30_000 });

    // Drilldown: select the FOCUS attempt's row (pinned by
    // data-attempt-id — the table sorts DESC, so "first" is wrong) →
    // unified timeline of that attempt, including the AI observation.
    const focusRow = dashboard.locator(
      `[data-testid="monitoring-participant-row"][data-attempt-id="${focusAttempt}"]`
    );
    await expect(focusRow).toBeVisible({ timeout: 30_000 });
    await focusRow.click();
    const timeline = teacherPage.getByLabel("Activity events");
    await expect(timeline).toBeVisible({ timeout: 30_000 });
    await expect(timeline.getByText("AI_ALERT_RAISED").first()).toBeVisible({
      timeout: 60_000,
    });

    // Review: FALSE_POSITIVE + note on the FOCUS attempt's alert card
    // (pinned by data-attempt-id — the feed is session-wide newest-first).
    const focusCard = teacherPage.locator(
      `[data-testid="ai-alert-card"][data-attempt-id="${focusAttempt}"]`
    );
    await expect(focusCard).toBeVisible({ timeout: 120_000 });
    const reviewForm = focusCard.getByTestId("alert-review-form");
    await expect(reviewForm).toBeVisible({ timeout: 30_000 });
    await reviewForm.getByRole("button", { name: "Báo động sai" }).click();
    await reviewForm.getByRole("textbox").fill("SIMULATED detector artefact — reviewed in R1");
    await reviewForm.getByRole("button", { name: "Lưu đánh giá" }).click();
    await expect(reviewForm.getByRole("status")).toBeVisible({ timeout: 30_000 });

    // The card now distinguishes teacher judgement from AI detection.
    await expect(focusCard.getByText("Giảng viên đánh giá")).toBeVisible({
      timeout: 30_000,
    });

    // Review history (append-only) shows the row.
    await reviewForm.getByRole("button", { name: "Xem lịch sử đánh giá" }).click();
    const history = reviewForm.getByTestId("alert-review-history");
    await expect(history.getByText("Báo động sai").first()).toBeVisible({ timeout: 30_000 });

    // Unified timeline gains the review event with review provenance.
    await expect(timeline.getByText("ALERT_REVIEW_RECORDED").first()).toBeVisible({
      timeout: 60_000,
    });

    // Full RELOAD backfill — REST is the durable truth.
    await teacherPage.reload();
    await expect(teacherPage.getByTestId("monitoring-dashboard")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      teacherPage.locator(
        `[data-testid="ai-alert-card"][data-attempt-id="${focusAttempt}"]`
      ).getByText("Giảng viên đánh giá")
    ).toBeVisible({ timeout: 30_000 });

    // Submit the focus attempt so the report has a closed window.
    const studentPage = contexts[0].pages()[0];
    await studentPage.getByRole("button", { name: /submit|nộp/i }).first().click();
    await expect(studentPage.getByText(/submitted|đã nộp/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // R2 report after close.
    const close = await apiJson(
      `/api/exams/${examId}/sessions/${sessionId}/close`,
      s.teacher.accessToken,
      { method: "POST" }
    );
    expect(close.status, close.raw ?? "").toBeLessThan(300);

    const reportCard = teacherPage.getByTestId("monitoring-report-card");
    await expect(reportCard).toBeVisible({ timeout: 30_000 });
    await reportCard.getByRole("combobox").first().selectOption(String(focusAttempt));
    const reportView = teacherPage.getByTestId("monitoring-report-view");
    await expect(reportView).toBeVisible({ timeout: 60_000 });
    await expect(reportView.getByText(/Monitoring observations only/i)).toBeVisible();
    await expect(reportView.getByText(focusAttempt.toString())).toBeVisible();

    // Printable route renders the SAME report with a print control.
    await teacherPage.goto(
      `/exams/${examId}/sessions/${sessionId}/monitoring-report/${focusAttempt}`
    );
    await expect(teacherPage.getByTestId("monitoring-report-view")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      teacherPage.getByRole("button", { name: "Print report" })
    ).toBeVisible();

    // Foreign teacher IDOR: API denies overview + report + reviews.
    const foreign = await registerVerifiedUser("TEACHER", `r-foreign-${Date.now()}`);
    const ov = await apiJson(
      `/api/exam-sessions/${sessionId}/monitoring/overview`,
      foreign.accessToken,
      {}
    );
    expect(ov.status).toBe(403);
    const rp = await apiJson(
      `/api/attempts/${focusAttempt}/monitoring/report`,
      foreign.accessToken,
      {}
    );
    expect(rp.status).toBe(403);
    const studentReport = await apiJson(
      `/api/attempts/${focusAttempt}/monitoring/report`,
      students[0].accessToken,
      {}
    );
    expect(studentReport.status).toBe(403);

    // Report payload keeps the three count layers separate and never leaks
    // grading (regression guard over the wire, real persisted data).
    const own = await apiJson<{
      ai: { rawDetections: number; groupedAlerts: number; reviewedAlerts: number };
      evidence: Array<{ status: string }>;
      disclaimer: string;
    }>(`/api/attempts/${focusAttempt}/monitoring/report`, s.teacher.accessToken, {});
    expect(own.status).toBe(200);
    expect(own.body!.ai.rawDetections).toBeGreaterThan(0);
    expect(own.body!.ai.groupedAlerts).toBeGreaterThan(0);
    expect(own.body!.ai.reviewedAlerts).toBe(1);
    expect(own.body!.disclaimer).toContain("No automated misconduct verdict");
    const raw = JSON.stringify(own.body!).toLowerCase();
    expect(raw).not.toContain("grade");
    expect(raw).not.toContain("score");

    for (const ctx of contexts) await ctx.close();
    await teacherCtx.close();
  });
});
