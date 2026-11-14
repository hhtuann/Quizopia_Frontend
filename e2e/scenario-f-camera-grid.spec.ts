import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { Page } from "@playwright/test";
import type { SmokeState } from "./helpers";

/**
 * Scenario F — Student cameras + teacher selective Camera Grid
 * (P4-B3, issue #86).
 *
 * Five synthetic-camera publishers (Chromium fake devices — SIMULATED
 * media, real WebRTC publish through self-hosted LiveKit) + one teacher
 * viewer. Asserts: grid tiles render with video, student isolation (no
 * remote videos on a student page), LOW-layer grid subscription with
 * HIGH only for fullscreen, foreign-teacher denial.
 */
test.describe("Scenario F — camera grid", () => {
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });

  let sessionId = 0;
  const students: Array<{ email: string; password: string; accessToken: string; name: string }> = [];

  test.beforeAll(async () => {
    // Fresh monitored classroom session + 5 student members.
    const res = await apiJson<{ id: number }>(`/api/exams/${s.examId}/sessions`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: `Smoke Grid Session ${Date.now()}`,
        startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
        maxAttempts: 1,
        visibility: "CLASS_RESTRICTED",
        classroomIds: [s.classroomId],
        monitoring: { monitoringEnabled: true, activityTrackingEnabled: true },
      }),
    });
    expect(res.status, res.raw ?? "").toBeLessThan(300);
    sessionId = res.body!.id;
    await apiJson(`/api/exams/${s.examId}/sessions/${sessionId}/schedule`, s.teacher.accessToken, { method: "POST" });
    await apiJson(`/api/exams/${s.examId}/sessions/${sessionId}/open`, s.teacher.accessToken, { method: "POST" });

    // Enrol 4 extra students (the seeded s.student joins as publisher 5).
    for (let i = 1; i <= 4; i++) {
      const u = await registerVerifiedUser("STUDENT", `grid-student-${i}-${Date.now()}`);
      await apiJson(`/api/classrooms/${s.classroomId}/members`, s.teacher.accessToken, {
        method: "POST",
        body: JSON.stringify({ email: u.email }),
      });
      students.push({ ...u, name: `Grid ${i}` });
    }
    students.unshift({
      email: s.student.email,
      password: s.student.password,
      accessToken: s.student.accessToken,
      name: "Primary",
    });
  });

  async function publisherFlow(page: Page, user: { email: string; password: string }) {
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

  test("F1 five publishers + teacher grid with selective subscription", async ({ browser }) => {
    test.setTimeout(300_000);
    // 5 isolated contexts each publish a (fake-device) camera.
    const contexts: Array<import("@playwright/test").BrowserContext> = [];
    const attemptIds: number[] = [];
    for (const stu of students) {
      // Synthetic camera comes from the shared launch flags; per-context
      // camera permission keeps the grant explicit.
      const ctx = await browser.newContext({ permissions: ["camera"] });
      contexts.push(ctx);
      const page = await ctx.newPage();
      attemptIds.push(await publisherFlow(page, stu));
    }

    // Student isolation: publisher 1's attempt page has NO remote videos.
    const studentPage = await contexts[0].newPage();
    await studentPage.goto(`/attempts/${attemptIds[0]}`);
    await expect(studentPage.getByText("Camera live")).toBeVisible({ timeout: 30_000 });
    const remoteVideos = await studentPage.evaluate(() => {
      const room = (window as unknown as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } })
        .__quizopiaMedia?.getRoom?.("attempt");
      const participants = room
        ? ((room as { remoteParticipants?: Map<string, unknown> }).remoteParticipants ?? new Map())
        : new Map();
      return {
        roomConnected: Boolean(room),
        remoteCount: participants.size,
        videoElements: document.querySelectorAll("video").length,
      };
    });
    expect(remoteVideos.roomConnected).toBe(true);
    expect(remoteVideos.remoteCount).toBe(0); // canSubscribe=false — nobody else
    // The attempt page shows a text-only status pill — no self-view video,
    // and certainly no remote videos.
    expect(remoteVideos.videoElements).toBe(0);

    // Teacher grid.
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
    await page_gotoSession(teacherPage, s.examId, sessionId);

    const grid = teacherPage.locator("[data-testid='camera-grid'], section:has-text('Camera monitoring')");
    await expect(grid.first()).toBeVisible({ timeout: 30_000 });
    const tiles = grid.locator("[data-media-identity]");
    await expect(tiles).toHaveCount(5, { timeout: 60_000 });

    // Every tile has a live video element with frames.
    for (const tile of await tiles.all()) {
      const video = tile.locator("video");
      await expect(video).toHaveCount(1);
      await expect
        .poll(async () => tile.locator("video").evaluate((v) => (v as HTMLVideoElement).readyState), {
          timeout: 30_000,
        })
        .toBeGreaterThanOrEqual(2);
    }
    await teacherPage.screenshot({ path: `${__dirname}/evidence/F1-teacher-grid-5.png`, fullPage: true });

    // Selective subscription quality: all subscribed at LOW; none at HIGH
    // until a fullscreen selection.
    const layersBefore = await teacherPage.evaluate(() => {
      const room = (window as unknown as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } })
        .__quizopiaMedia?.getRoom?.("teacher");
      if (!room) return null;
      const out: Record<string, string> = {};
      for (const [, p] of (room as { remoteParticipants: Map<string, { trackPublications?: Map<string, { trackSid?: string; videoQuality?: string; source?: string }> }> })
        .remoteParticipants) {
        for (const pub of p.trackPublications?.values() ?? []) {
          if (pub.trackSid && (pub as { source?: string }).source === "camera") {
            out[pub.trackSid] = String((pub as { videoQuality?: string }).videoQuality ?? "unknown");
          }
        }
      }
      return out;
    });
    expect(layersBefore).not.toBeNull();
    expect(Object.keys(layersBefore!).length).toBe(5);
    for (const q of Object.values(layersBefore!)) {
      expect(["low", "unknown"]).toContain(q.toLowerCase());
    }

    // Fullscreen one tile → its layer becomes HIGH.
    const firstTile = tiles.first();
    const tileName = await firstTile.getAttribute("data-media-identity");
    await firstTile.getByRole("button", { name: /^Fullscreen/ }).click();
    await teacherPage.waitForTimeout(2_500); // layer switch is async
    await teacherPage.screenshot({ path: `${__dirname}/evidence/F1-fullscreen.png` });
    const layersAfter = await teacherPage.evaluate(() => {
      const room = (window as unknown as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } })
        .__quizopiaMedia?.getRoom?.("teacher");
      if (!room) return null;
      const out: Record<string, string> = {};
      for (const [, p] of (room as { remoteParticipants: Map<string, { trackPublications?: Map<string, { trackSid?: string; videoQuality?: string; source?: string }> }> })
        .remoteParticipants) {
        for (const pub of p.trackPublications?.values() ?? []) {
          if (pub.trackSid && (pub as { source?: string }).source === "camera") {
            out[pub.trackSid] = String((pub as { videoQuality?: string }).videoQuality ?? "unknown");
          }
        }
      }
      return out;
    });
    const highs = Object.entries(layersAfter!).filter(([, q]) => q.toLowerCase() === "high");
    expect(highs.length).toBe(1);
    expect(tileName).toBeTruthy();

    // Foreign teacher denied.
    const deniedStatus = await apiJson(
      `/api/exam-sessions/${sessionId}/monitoring/camera-status`,
      s.stranger.accessToken
    );
    expect(deniedStatus.status).toBe(403);
    const deniedToken = await apiJson(
      `/api/exam-sessions/${sessionId}/monitoring/media-token`,
      s.stranger.accessToken
    );
    expect(deniedToken.status).toBe(403);

    // Evidence: publish state for scenario G.
    await fs.writeFile(
      `${__dirname}/.smoke-camera-f.json`,
      JSON.stringify({ sessionId, attemptIds, students })
    );

    // Keep publisher contexts OPEN for scenario G (recovery) — close teacher.
    await teacherCtx.close();
    // stash contexts for G via globalThis
    (globalThis as unknown as { __gridContexts?: unknown[] }).__gridContexts = contexts;
  });
});

async function page_gotoSession(page: Page, examId: number, sessionId: number) {
  await page.goto(`/exams/${examId}/sessions/${sessionId}`);
}
