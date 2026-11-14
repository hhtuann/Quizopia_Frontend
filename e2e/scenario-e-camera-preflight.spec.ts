import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { apiJson, loginViaUi, state } from "./helpers";
import type { SmokeState } from "./helpers";

/**
 * Scenario E — Camera preflight & monitored start gate (P4-B2, issue #85).
 *
 * Media note: Chromium runs with --use-fake-device-for-media-stream → the
 * published track is SYNTHETIC (labelled evidence), but every hop after
 * getUserMedia is real: real LiveKit WebRTC publish, real signed webhook,
 * real RoomService verification, real one-time lease consumption.
 */
test.describe("Scenario E — camera preflight & start gate", () => {
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });

  let monitoredSessionId = 0;

  async function createMonitoredSession(): Promise<number> {
    const res = await apiJson<{ id: number }>(
      `/api/exams/${s.examId}/sessions`,
      s.teacher.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: `Smoke Camera Session ${Date.now()}`,
          startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
          maxAttempts: 1,
          visibility: "CLASS_RESTRICTED",
          classroomIds: [s.classroomId],
          monitoring: { monitoringEnabled: true, activityTrackingEnabled: true },
        }),
      }
    );
    expect(res.status, res.raw ?? "").toBeLessThan(300);
    const id = res.body!.id;
    await apiJson(`/api/exams/${s.examId}/sessions/${id}/schedule`, s.teacher.accessToken, { method: "POST" });
    await apiJson(`/api/exams/${s.examId}/sessions/${id}/open`, s.teacher.accessToken, { method: "POST" });
    return id;
  }

  test("E1 start without a lease is rejected (fail-closed gate)", async () => {
    monitoredSessionId = await createMonitoredSession();
    const denied = await apiJson<{ code?: string }>(
      `/api/exam-sessions/${monitoredSessionId}/attempts`,
      s.student.accessToken,
      { method: "POST", body: JSON.stringify({ clientInstanceId: crypto.randomUUID() }) }
    );
    expect(denied.status).toBe(409);
    expect(denied.body?.code).toBe("MONITORING_PREFLIGHT_REQUIRED");
  });

  test("E2 verify without a published camera never yields a lease", async () => {
    // Preflight created but the browser never connects/publishes.
    const pre = await apiJson<{ preflightId: string }>(
      `/api/exam-sessions/${monitoredSessionId}/monitoring/preflights`,
      s.student.accessToken,
      { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
    );
    expect(pre.status).toBe(200);
    const verify = await apiJson<{ state?: string }>(
      `/api/exam-sessions/${monitoredSessionId}/monitoring/preflights/${pre.body!.preflightId}/verify`,
      s.student.accessToken,
      { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
    );
    expect(verify.status).toBe(200);
    expect(verify.body?.state).toBe("NOT_PUBLISHED");
  });

  test("E3 UI preflight → verified → start with lease (fake camera)", async ({ page }) => {
    test.setTimeout(150_000);
    await loginViaUi(page, s.student.email, s.student.password);
    await page.goto(`/sessions/${monitoredSessionId}`);

    const preflight = page.getByTestId("camera-preflight");
    await expect(preflight).toBeVisible();

    await preflight.getByRole("button", { name: "Enable camera" }).click();

    // Fake device auto-grants → preview → connect → publish → server verify.
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${__dirname}/evidence/E3-camera-verified.png`, fullPage: true });

    await page.getByRole("button", { name: "Start the attempt" }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });

    // Attempt page shows the live camera pill (synthetic feed, real publish).
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: `${__dirname}/evidence/E3-attempt-camera-live.png`, fullPage: true });

    const attemptId = Number(new URL(page.url()).pathname.split("/")[2]);
    await fs_writeAttemptE(attemptId, monitoredSessionId);
  });

  test("E4 preflight is blocked while the attempt is IN_PROGRESS", async () => {
    // E3 started the attempt; a new preflight must be refused with the
    // exact already-active contract (single-spend of the lease itself is
    // covered by CameraPreflightServiceIntegrationTests).
    const pre = await apiJson<{ code?: string }>(
      `/api/exam-sessions/${monitoredSessionId}/monitoring/preflights`,
      s.student.accessToken,
      { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
    );
    expect(pre.status).toBe(409);
    expect(pre.body?.code).toBe("ATTEMPT_ALREADY_ACTIVE");
  });
});

async function fs_writeAttemptE(attemptId: number, sessionId: number) {
  await fs.writeFile(
    `${__dirname}/.smoke-camera-e.json`,
    JSON.stringify({ attemptId, sessionId, student: state().student })
  );
}
