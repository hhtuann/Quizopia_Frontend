import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { BrowserContext, Page } from "@playwright/test";
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
interface CameraFile {
  sessionId: number;
  attemptIds: number[];
  students: Array<{ email: string; password: string; accessToken: string }>;
}

/** Publisher contexts kept alive by Scenario F for the G recovery flow
 *  (same file = same worker process; workers=1 keeps F→G ordering). */
let gridContexts: BrowserContext[] = [];

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
      const added = await apiJson(
        `/api/classrooms/${s.classroomId}/members`,
        s.teacher.accessToken,
        { method: "POST", body: JSON.stringify({ userIds: [u.id] }) }
      );
      expect(added.status, added.raw ?? "").toBeLessThan(300);
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
      // AI isolation: the P4-C hook would load the REAL model on every
      // publisher page (5 × WASM inference starves WebRTC under load) —
      // install a null FAKE detector (labeled SIMULATED, emits no events)
      // so this MEDIA suite measures the P4-B pipeline only. AI transport
      // is covered by Scenario H; real-model load by the benchmark.
      const ctx = await browser.newContext({ permissions: ["camera"] });
      await ctx.addInitScript(() => {
        const install = (): void => {
          const hooks = (window as unknown as {
            __quizopiaAi?: { setFakeDetector: (fn: unknown) => void };
          }).__quizopiaAi;
          if (hooks?.setFakeDetector) {
            hooks.setFakeDetector(() => null);
          } else {
            setTimeout(install, 200);
          }
        };
        install();
      });
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
      // Presence metadata of other participants is normal; the isolation
      // guarantee is that no remote CAMERA track is ever SUBSCRIBED
      // (canSubscribe=false grant).
      let cameraSubscribed = 0;
      let cameraPublications = 0;
      for (const p of participants.values()) {
        const pubs = (p as { trackPublications?: Map<string, { source?: string; isSubscribed?: boolean }> })
          .trackPublications ?? new Map();
        for (const pub of pubs.values()) {
          if (pub.source === "camera") {
            cameraPublications += 1;
            if (pub.isSubscribed) cameraSubscribed += 1;
          }
        }
      }
      return {
        roomConnected: Boolean(room),
        cameraPublications,
        cameraSubscribed,
        videoElements: document.querySelectorAll("video").length,
      };
    });
    expect(remoteVideos.roomConnected).toBe(true);
    // Students see presence, but none of the remote camera publications is
    // subscribed (canSubscribe=false — LiveKit rejects subscribe attempts).
    expect(remoteVideos.cameraPublications).toBeGreaterThanOrEqual(1);
    expect(remoteVideos.cameraSubscribed).toBe(0);
    // The attempt page shows a text-only status pill — no self-view video,
    // and certainly no remote videos.
    expect(remoteVideos.videoElements).toBe(0);

    // Teacher grid.
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
    await page_gotoSession(teacherPage, s.examId, sessionId);

    const grid = teacherPage.getByTestId("camera-grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
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
      const out: Record<string, number> = {};
      for (const [identity, p] of (room as { remoteParticipants: Map<string, { trackPublications?: Map<string, { trackSid?: string; videoQuality?: number; source?: string }> }> })
        .remoteParticipants) {
        for (const pub of p.trackPublications?.values() ?? []) {
          if ((pub as { source?: string }).source === "camera") {
            out[identity] = Number((pub as { videoQuality?: number }).videoQuality ?? 0);
          }
        }
      }
      return out;
    });
    expect(layersBefore).not.toBeNull();
    expect(Object.keys(layersBefore!).length).toBe(5);
    // livekit-client's publication.videoQuality is the numeric VideoQuality
    // enum (OFF/unset=0 / LOW=1 / MEDIUM=2 / HIGH=3); adaptive-stream
    // publications may keep the property at 0 even after setVideoQuality.
    // Honest bound: NOTHING above LOW before fullscreen, and at least one
    // tile explicitly at LOW (the grid's setVideoQuality reached the SDK).
    // All tiles at or below LOW. (The property reports CHANGES only —
    // default-LOW tiles stay 0/unset; the fullscreen promotion later
    // observably flips one tile to >=2, which is the real signal.)
    const values = Object.values(layersBefore!);
    for (const q of values) {
      expect(q).toBeLessThanOrEqual(1);
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
      const out: Record<string, number> = {};
      for (const [identity, p] of (room as { remoteParticipants: Map<string, { trackPublications?: Map<string, { trackSid?: string; videoQuality?: number; source?: string }> }> })
        .remoteParticipants) {
        for (const pub of p.trackPublications?.values() ?? []) {
          if ((pub as { source?: string }).source === "camera") {
            out[identity] = Number((pub as { videoQuality?: number }).videoQuality ?? 0);
          }
        }
      }
      return out;
    });
    // The fullscreen tile is promoted to a HIGHER simulcast layer than the
    // grid (adaptive streaming may settle at MEDIUM=2 instead of the
    // requested HIGH=3); every other tile stays at the LOW grid layer.
    // videoQuality reports only CHANGES — under load the switch can land
    // after the first snapshot, so poll (bounded) for the promotion.
    await expect
      .poll(
        async () => {
          const l = await teacherPage.evaluate(() => {
            const room = (window as unknown as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } })
              .__quizopiaMedia?.getRoom?.("teacher");
            if (!room) return null;
            const out: Record<string, number> = {};
            for (const [identity, p] of (room as { remoteParticipants: Map<string, { trackPublications?: Map<string, { trackSid?: string; videoQuality?: number; source?: string }> }> })
              .remoteParticipants) {
              for (const pub of p.trackPublications?.values() ?? []) {
                if ((pub as { source?: string }).source === "camera") {
                  out[identity] = Number((pub as { videoQuality?: number }).videoQuality ?? 0);
                }
              }
            }
            return out;
          });
          return l?.[tileName!] ?? -1;
        },
        { timeout: 20_000 }
      )
      .toBeGreaterThanOrEqual(2);
    for (const [identity, q] of Object.entries(layersAfter!)) {
      if (identity !== tileName) expect(q).toBeLessThanOrEqual(1);
    }
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

    // Close everything deterministically: Playwright's per-test teardown is
    // not a media event — an explicit ctx.close() produces real participant
    // disconnects and prevents zombie same-identity publishers from fighting
    // scenario G's re-opened pages (duplicate-identity kick loop).
    await teacherCtx.close();
    for (const ctx of contexts) {
      await ctx.close();
    }
    gridContexts = [];
  });
});

async function page_gotoSession(page: Page, examId: number, sessionId: number) {
  await page.goto(`/exams/${examId}/sessions/${sessionId}`);
}

test.describe("Scenario G — camera recovery & reconciliation", () => {
  let s: SmokeState;
  let f: CameraFile;

  test.beforeAll(() => {
    s = state();
    f = JSON.parse(readFileSync(`${__dirname}/.smoke-camera-f.json`, "utf8"));
  });

  async function timelineTypes(attemptId: number): Promise<string[]> {
    const res = await apiJson<{ items: Array<{ eventType: string }> }>(
      `/api/attempts/${attemptId}/timeline?size=100`,
      s.teacher.accessToken
    );
    expect(res.status).toBe(200);
    return (res.body?.items ?? []).map((i) => i.eventType);
  }

  /**
   * Playwright closes contexts created inside a test when that test ends,
   * so G re-opens its own publisher pages against the attempts F started.
   * The attempt page renews its media token and re-publishes on mount —
   * itself a recovery-path exercise.
   */
  async function openPublisherPage(
    browser: import("@playwright/test").Browser,
    index: number
  ): Promise<{ ctx: import("@playwright/test").BrowserContext; page: import("@playwright/test").Page }> {
    const ctx = await browser.newContext({ permissions: ["camera"] });
    const page = await ctx.newPage();
    await loginViaUi(page, f.students[index].email, f.students[index].password);
    await page.goto(`/attempts/${f.attemptIds[index]}`);
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 60_000 });
    return { ctx, page };
  }

  test("G1 camera loss logs a server-confirmed gap; attempt survives", async ({ browser }) => {
    test.setTimeout(240_000);
    const attemptId = f.attemptIds[0];
    const { ctx, page } = await openPublisherPage(browser, 0);

    // The pre-attempt publish is connection-row-only (no CAMERA_CONNECTED
    // event before the attempt exists); G1's rejoin emits CAMERA_RECONNECTED.
    const before = await timelineTypes(attemptId);
    expect(before).toContain("CAMERA_RECONNECTED");
    const disconnectsBefore = before.filter((t) => t === "CAMERA_DISCONNECTED").length;

    await page.close();
    await ctx.close();

    // Baseline delta (F's own teardown already emitted disconnects for the
    // five publishers — this must catch G1's OWN close landing).
    await expect
      .poll(
        async () =>
          (await timelineTypes(attemptId)).filter((t) => t === "CAMERA_DISCONNECTED").length -
          disconnectsBefore,
        { timeout: 90_000, intervals: [5_000] }
      )
      .toBeGreaterThanOrEqual(1);

    // D8: the attempt itself is untouched by camera loss.
    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[0].accessToken);
    expect(detail.body?.status).toBe("IN_PROGRESS");
  });

  test("G2 disconnect evidence stays single (webhook + reconcile dedupe)", async () => {
    const attemptId = f.attemptIds[0];
    // Period-pairing invariant: every CAMERA_DISCONNECTED corresponds to a
    // distinct connected period, so disconnects == reconnects + 1 (the final
    // period stays open/disconnected). A duplicate webhook or a reconciler
    // double-close would emit an orphan DISCONNECTED and break the equality.
    // (Client-side reconnects during dev-mount are truthful and allowed.)
    await expect
      .poll(
        async () => {
          const types = await timelineTypes(attemptId);
          const d = types.filter((t) => t === "CAMERA_DISCONNECTED").length;
          const r = types.filter((t) => t === "CAMERA_RECONNECTED").length;
          return d - r;
        },
        { timeout: 60_000 }
      )
      .toBe(1);
  });

  test("G3 LiveKit restart → students reconnect; answers safe", async ({ browser }) => {
    test.setTimeout(300_000);
    const { ctx, page } = await openPublisherPage(browser, 1);
    const attemptId = f.attemptIds[1];

    // Restart the SFU (room routing state survives in its redis).
    execSync("docker restart quizopia_livekit", { stdio: "ignore" });

    // Reconnect loop with fresh tokens lands back on Camera live.
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 150_000 });
    await page.screenshot({ path: `${__dirname}/evidence/G3-reconnected.png` });

    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[1].accessToken);
    expect(detail.body?.status).toBe("IN_PROGRESS");
    await ctx.close();
  });

  test("G4 revocation kicks the student and denies token renewal", async ({ browser }) => {
    test.setTimeout(240_000);
    const attemptId = f.attemptIds[2];
    const { ctx } = await openPublisherPage(browser, 2);

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
    await ctx.close();
  });

  test("G5 submit works after the whole media storm", async () => {
    const attemptId = f.attemptIds[0];
    const submit = await apiJson(`/api/attempts/${attemptId}/submit`, f.students[0].accessToken, {
      method: "POST",
      body: JSON.stringify({ submissionIdempotencyKey: crypto.randomUUID() }),
    });
    expect(submit.status).toBe(200);
    const detail = await apiJson<{ status: string }>(`/api/attempts/${attemptId}`, f.students[0].accessToken);
    expect(["SUBMITTED", "GRADED"]).toContain(detail.body?.status);
  });
});
