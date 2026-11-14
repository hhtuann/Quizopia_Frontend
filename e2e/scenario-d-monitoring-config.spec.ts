import { test, expect } from "@playwright/test";
import { apiJson, inMinutes, loginViaUi, state } from "./helpers";
import type { SmokeState } from "./helpers";

interface SessionDetail {
  id: number;
  status: string;
  version: number;
  monitoring: {
    monitoringEnabled: boolean;
    cameraRequired: boolean;
    aiDetectionEnabled: boolean;
    fullRecordingEnabled: boolean;
    configurationFrozen: boolean;
  };
}
interface ApiError {
  code: string;
}

async function createSessionViaApi(
  token: string,
  examId: number,
  body: Record<string, unknown>
): Promise<{ status: number; id: number; version: number }> {
  const res = await apiJson<SessionDetail>(`/api/exams/${examId}/sessions`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    id: res.body?.id ?? 0,
    version: res.body?.version ?? 0,
  };
}

/**
 * Scenario D — Monitoring Configuration.
 * UI: enable monitoring → derived camera requirement, recording OFF default,
 * prerequisite gating. API negatives: PUBLIC + monitoring, zero-class.
 * Freeze after open. Student notice + fail-closed start (no P4-B camera).
 */
test.describe("Scenario D — monitoring configuration", () => {
  // Lazily populated: globalSetup writes the state file before tests run.
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });
  let monitoredSessionId = 0;

  test("D1 UI: enabling monitoring derives camera + gates flags", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${s.examId}/sessions/new`);
    await page.fill("#session-title", "Smoke Monitored Session");
    await page.fill("#session-startsAt", inMinutes(-5));
    await page.fill("#session-endsAt", inMinutes(55));
    await page.fill("#session-maxAttempts", "1");
    await page.getByLabel(new RegExp(s.classroomName, "i")).check();

    const enable = page.getByRole("checkbox", { name: /enable exam monitoring/i });
    await enable.check();

    // Derived camera requirement appears (display-only).
    await expect(page.getByText("Camera required")).toBeVisible();

    // Full recording defaults OFF.
    const recording = page.getByRole("checkbox", { name: /full recording/i }).first();
    await expect(recording).not.toBeChecked();

    // Prerequisites: snapshots require AI detection; clips require recording.
    const ai = page.getByRole("checkbox", { name: /^AI detection/i }).first();
    const snapshots = page.getByRole("checkbox", { name: /evidence snapshots/i }).first();
    const clips = page.getByRole("checkbox", { name: /evidence clips/i }).first();
    await expect(snapshots).toBeDisabled();
    await ai.check();
    await expect(snapshots).toBeEnabled();
    await expect(clips).toBeDisabled();
    await recording.check();
    await expect(clips).toBeEnabled();
    await page.screenshot({ path: "e2e/evidence/D1-monitoring-config.png", fullPage: true });

    await page.getByRole("button", { name: "Create session" }).click();
    // The create flow returns to the exam's Sessions tab; resolve the id by title.
    await page.waitForURL(/tab=sessions/, { timeout: 30_000 });
    const listed = await apiJson<{ items: Array<{ id: number; title: string }> }>(
      `/api/exams/${s.examId}/sessions?page=0&size=10&search=Smoke%20Monitored%20Session`,
      s.teacher.accessToken
    );
    const created = (listed.body?.items ?? []).find((x) => x.title === "Smoke Monitored Session");
    expect(created).toBeTruthy();
    monitoredSessionId = created!.id;

    const detail = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${monitoredSessionId}`,
      s.teacher.accessToken
    );
    expect(detail.body?.monitoring.monitoringEnabled).toBe(true);
    expect(detail.body?.monitoring.cameraRequired).toBe(true); // derived
    expect(detail.body?.monitoring.fullRecordingEnabled).toBe(true);
  });

  test("D2 backend rejects PUBLIC + monitoring", async () => {
    const res = await createSessionViaApi(s.teacher.accessToken, s.examId, {
      title: "Smoke Public Monitored",
      startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
      maxAttempts: 1,
      visibility: "PUBLIC",
      classroomIds: [],
      monitoring: { monitoringEnabled: true },
    });
    expect(res.status).toBe(400);
  });

  test("D3 backend rejects CLASS_RESTRICTED without classes + monitoring", async () => {
    const res = await createSessionViaApi(s.teacher.accessToken, s.examId, {
      title: "Smoke NoClass Monitored",
      startsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 90 * 60_000).toISOString(),
      maxAttempts: 1,
      visibility: "CLASS_RESTRICTED",
      classroomIds: [],
      monitoring: { monitoringEnabled: true },
    });
    expect(res.status).toBe(400);
  });

  test("D4 configuration freezes once the session opens", async () => {
    await apiJson(
      `/api/exams/${s.examId}/sessions/${monitoredSessionId}/schedule`,
      s.teacher.accessToken,
      { method: "POST" }
    );
    const opened = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${monitoredSessionId}/open`,
      s.teacher.accessToken,
      { method: "POST" }
    );
    expect(opened.status).toBe(200);

    const detail = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${monitoredSessionId}`,
      s.teacher.accessToken
    );
    expect(detail.body?.monitoring.configurationFrozen).toBe(true);

    // Mutation attempt (disable monitoring) → 409 frozen.
    const frozen = await apiJson<ApiError>(
      `/api/exams/${s.examId}/sessions/${monitoredSessionId}`,
      s.teacher.accessToken,
      {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: detail.body?.version,
          title: "Smoke Monitored Session",
          startsAt: detail.body ? new Date(Date.now() + 30 * 60_000).toISOString() : "",
          endsAt: detail.body ? new Date(Date.now() + 90 * 60_000).toISOString() : "",
          maxAttempts: 1,
          monitoring: { monitoringEnabled: false },
        }),
      }
    );
    expect(frozen.status).toBe(409);
  });

  test("D5 student sees the monitoring notice; start is fail-closed", async ({ page }) => {
    await loginViaUi(page, s.student.email, s.student.password);
    await page.goto(`/sessions/${monitoredSessionId}`);

    await expect(page.getByText("Camera required — monitored session")).toBeVisible();
    const start = page.getByRole("button", { name: /start the attempt/i });
    await expect(start).toBeDisabled();
    await page.screenshot({ path: "e2e/evidence/D5-student-notice.png", fullPage: true });

    // Backend backstop: direct start → the defined fail-closed error, no attempt.
    const denied = await apiJson<ApiError>(
      `/api/exam-sessions/${monitoredSessionId}/attempts`,
      s.student.accessToken,
      { method: "POST", body: JSON.stringify({}) }
    );
    expect(denied.status).toBe(409);
    expect(denied.body?.code).toBe("ATTEMPT_MONITORING_START_UNAVAILABLE");

    const attempts = await apiJson<{ items?: unknown[] }>(
      "/api/attempts/my?page=0&size=50",
      s.student.accessToken
    );
    const mine = attempts.body?.items ?? [];
    // Only the Scenario A/B attempts exist — none from the monitored session.
    expect(mine.length).toBeLessThan(3);
  });
});
