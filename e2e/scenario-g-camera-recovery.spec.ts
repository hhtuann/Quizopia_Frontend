import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { apiJson, state } from "./helpers";
import type { SmokeState } from "./helpers";

interface CameraFile {
  sessionId: number;
  attemptIds: number[];
  students: Array<{ email: string; password: string; accessToken: string }>;
}

/**
 * Scenario G — Recovery & reconciliation (P4-B4, issue #87).
 *
 * Uses the LIVE publishers/room started in Scenario F (same run, workers=1):
 * camera loss → server-confirmed gap in the monitoring timeline while the
 * attempt continues; LiveKit restart → token-renewal reconnect; webhook
 * dedupe keeps single events; revocation → kick + renewal denied;
 * submit/grade unaffected. ADR-08 D8: media failures never punish.
 */
test.describe("Scenario G — camera recovery & reconciliation", () => {
  let s: SmokeState;
  let f: CameraFile;

  test.beforeAll(() => {
    s = state();
    f = JSON.parse(readFileSync(`${__dirname}/.smoke-camera-f.json`, "utf8"));
  });

  async function timelineTypes(attemptId: number): Promise<string[]> {
    const res = await apiJson<{ items: Array<{ activityType: string }> }>(
      `/api/attempts/${attemptId}/timeline?size=100`,
      s.teacher.accessToken
    );
    expect(res.status).toBe(200);
    return (res.body?.items ?? []).map((i) => i.activityType);
  }

  test("G1 camera loss logs a server-confirmed gap; attempt survives", async () => {
    test.setTimeout(180_000);
    const attemptId = f.attemptIds[0];

    const before = await timelineTypes(attemptId);
    expect(before).toContain("CAMERA_CONNECTED");

    // Break the media: closing the page disconnects the room → LiveKit
    // participant_left webhook (plus reconcile as backstop).
    const ctx = (globalThis as unknown as { __gridContexts?: import("@playwright/test").BrowserContext[] })
      .__gridContexts;
    expect(ctx, "scenario F must run before G (workers=1 ordering)").toBeTruthy();
    const page = ctx![0].pages().find((p) => p.url().includes(`/attempts/${attemptId}`));
    expect(page).toBeTruthy();
    await page!.close();

    await expect
      .poll(
        async () => (await timelineTypes(attemptId)).filter((t) => t === "CAMERA_DISCONNECTED").length,
        { timeout: 90_000, intervals: [5_000] }
      )
      .toBeGreaterThanOrEqual(1);

    // D8: the attempt itself is untouched by camera loss.
    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[0].accessToken);
    expect(detail.body?.status).toBe("IN_PROGRESS");
  });

  test("G2 disconnect evidence stays single (webhook + reconcile dedupe)", async () => {
    const attemptId = f.attemptIds[0];
    // The webhook and the 30s reconciler can both observe the loss; only
    // one CAMERA_DISCONNECTED row may exist per period.
    await expect
      .poll(async () => (await timelineTypes(attemptId)).filter((t) => t === "CAMERA_DISCONNECTED").length, {
        timeout: 45_000,
      })
      .toBe(1);
  });

  test("G3 LiveKit restart → students reconnect; answers safe", async () => {
    test.setTimeout(240_000);
    // Restart the SFU (room routing state survives in its redis).
    execSync("docker restart quizopia_livekit", { stdio: "ignore" });

    const attemptId = f.attemptIds[1];
    const ctx = (globalThis as unknown as { __gridContexts?: import("@playwright/test").BrowserContext[] })
      .__gridContexts!;
    const page = ctx[1].pages().find((p) => p.url().includes(`/attempts/${attemptId}`));
    expect(page).toBeTruthy();

    // Reconnect loop with fresh tokens lands back on Camera live.
    await expect(page!.getByText("Camera live")).toBeVisible({ timeout: 120_000 });

    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[1].accessToken);
    expect(detail.body?.status).toBe("IN_PROGRESS");
    await page!.screenshot({ path: `${__dirname}/evidence/G3-reconnected.png` });
  });

  test("G4 revocation kicks the student and denies token renewal", async () => {
    test.setTimeout(180_000);
    const attemptId = f.attemptIds[2];
    const status = await apiJson<{
      participants: Array<{ mediaIdentity: string; attemptId: number | null; state: string }>;
    }>(`/api/exam-sessions/${f.sessionId}/monitoring/camera-status`, s.teacher.accessToken);
    expect(status.status).toBe(200);
    const victim = status.body!.participants.find((p) => p.attemptId === attemptId);
    expect(victim, "publisher 3 must appear in camera status").toBeTruthy();

    const revoke = await apiJson(
      `/api/exam-sessions/${f.sessionId}/monitoring/participants/${victim!.mediaIdentity}/revoke`,
      s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
    );
    expect([200, 204]).toContain(revoke.status);

    // App-layer revocation beats token TTL for renewal.
    const renew = await apiJson<{ code?: string }>(
      `/api/attempts/${attemptId}/monitoring/media-token`,
      f.students[2].accessToken,
      { method: "POST", body: JSON.stringify({ schemaVersion: 1 }) }
    );
    expect(renew.status).toBe(403);
    expect(renew.body?.code).toBe("MONITORING_CAMERA_REVOKED");

    await expect
      .poll(async () => (await timelineTypes(attemptId)).includes("CAMERA_REVOKED"), { timeout: 30_000 })
      .toBe(true);

    // Attempt validity survives revocation (no auto-punishment).
    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[2].accessToken);
    expect(detail.body?.status).toBe("IN_PROGRESS");
  });

  test("G5 submit works after the whole media storm", async () => {
    const attemptId = f.attemptIds[0];
    const submit = await apiJson(`/api/attempts/${attemptId}/submit`, f.students[0].accessToken, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), answers: [] }),
    });
    expect([200, 400]).toContain(submit.status);
    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[0].accessToken);
    expect(["SUBMITTED", "GRADED"]).toContain(detail.body?.status);
  });
});
