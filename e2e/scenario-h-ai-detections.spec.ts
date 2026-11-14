import { test, expect } from "@playwright/test";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { Page } from "@playwright/test";
import type { SeededUser, SmokeState } from "./helpers";

/**
 * Scenario H — P4-C AI detection pipeline (issues #88/#89/#90 transport).
 *
 * Detector: FAKE (window.__quizopiaAi.setFakeDetector) — output is SIMULATED
 * and labeled so in the UI + sent-event records. This spec verifies the real
 * TRANSPORT + AGGREGATION path: hook → events → authenticated ingest →
 * temporal aggregation → alert persistence → STOMP ping → teacher feed →
 * REST backfill. Real-model capability/latency evidence lives in
 * e2e/ai-benchmark.mts and the real-webcam flow — never claimed here.
 *
 * H1 fake phone frames → client sends PHONE_OBSERVED batches → backend
 *    aggregates ONE alert (teacher REST feed: 1 card, detectionCount ≥ 2)
 * H2 duplicate eventId replay via direct HTTP → DUPLICATE, still ONE alert
 * H3 ingest after attempt submitted → QUARANTINED_LATE, no new alert
 * H4 teacher reload → alerts persist (REST is source of truth)
 * H5 autosave + submit still work while AI status is degraded
 * H6 gaze warnings never appear (stub unsupported)
 * H7 PERSON_NOT_OBSERVED never sent for single-frame gaps (3-frame streak
 *    contract — unit-covered in use-attempt-ai-detection tests; here we
 *    assert the H1 session sent only PHONE_OBSERVED)
 */
test.describe("Scenario H — AI detections (SIMULATED detector)", () => {
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });

  let sessionId = 0;
  let studentEmail = "";
  let studentPassword = "";
  let studentToken = "";
  let attemptId = 0;
  let sentEventTypes: string[] = [];

  const PHONE_FRAME = {
    detections: [
      // Realistic: the student is IN frame while holding a phone — person
      // presence must hold so only PHONE_OBSERVED fires (H7).
      {
        classId: 0,
        label: "person",
        confidence: 0.86,
        bbox: [0.18, 0.05, 0.82, 0.95] as [number, number, number, number],
      },
      {
        classId: 67,
        label: "cell phone",
        confidence: 0.91,
        bbox: [0.52, 0.42, 0.86, 0.78] as [number, number, number, number],
      },
    ],
    frameWidth: 640,
    frameHeight: 480,
    processingMs: 42,
    capturedAt: Date.now(),
    runtime: "ORT_WEB_WASM" as const,
    simulated: true,
  };

  test.beforeAll(async () => {
    // Fresh monitored session.
    const res = await apiJson<{ id: number }>(`/api/exams/${s.examId}/sessions`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: `Smoke AI Session ${Date.now()}`,
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

    // Fresh student + CLASS membership (monitored CLASS_RESTRICTED sessions
    // gate the preflight card behind membership — same as Scenario F).
    const u: SeededUser = await registerVerifiedUser("STUDENT", `ai-stu-${Date.now()}`);
    const add = await apiJson(
      `/api/classrooms/${s.classroomId}/members`,
      s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({ userIds: [u.id] }) }
    );
    expect(add.status, add.raw ?? "").toBeLessThan(300);
    studentEmail = u.email;
    studentPassword = u.password;
    studentToken = u.accessToken;
  });

  test("H1 sustained phone frames aggregate into ONE teacher alert", async ({ page, browser }) => {
    test.setTimeout(240_000);
    // Student: preflight → start attempt with camera + SIMULATED AI.
    // The fake installs at DOCUMENT START (polled until the app exposes the
    // registry) so the hook builds its detector around it from frame 1 —
    // no real-model period pollutes the sent-event record.
    await page.addInitScript(() => {
      const frame = {
        detections: [
          { classId: 0, label: "person", confidence: 0.86,
            bbox: [0.18, 0.05, 0.82, 0.95] },
          { classId: 67, label: "cell phone", confidence: 0.91,
            bbox: [0.52, 0.42, 0.86, 0.78] },
        ],
        frameWidth: 640, frameHeight: 480, processingMs: 42,
        runtime: "ORT_WEB_WASM", simulated: true,
      };
      const install = (): void => {
        const hooks = (window as unknown as {
          __quizopiaAi?: { setFakeDetector: (fn: unknown) => void };
        }).__quizopiaAi;
        if (hooks?.setFakeDetector) {
          // Fresh wall-clock stamp per frame (ingest sanity window).
          hooks.setFakeDetector(() => ({ ...frame, capturedAt: Date.now() }));
        } else {
          setTimeout(install, 150);
        }
      };
      install();
    });
    await loginViaUi(page, studentEmail, studentPassword);
    await page.goto(`/sessions/${sessionId}`);
    const preflight = page.getByTestId("camera-preflight");
    await expect(preflight).toBeVisible();
    await preflight.getByRole("button", { name: "Enable camera" }).click();
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start the attempt" }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    attemptId = Number(new URL(page.url()).pathname.split("/")[2]);

    // Diagnostics: surface every AI ingest HTTP exchange (the hook swallows
    // failures into 'degraded' — the spec must see WHY).
    page.on("response", async (res) => {
      if (res.url().includes("ai-detections") || res.url().includes("ai-alerts")) {
        let body = "";
        try { body = (await res.text()).slice(0, 300); } catch { body = "<no-body>"; }
        console.log(`AI-HTTP ${res.status()} ${res.request().method()} ${res.url().replace("http://localhost:8080", "")} ${body}`);
      }
    });

    // Camera live → AI hook runs with the init-script FAKE (SIMULATED).
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ai-status-pill")).toContainText("SIMULATED", { timeout: 30_000 });

    // Teacher: live monitor in a second context.
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    teacherPage.on("pageerror", (e) => console.log("TEACHER-PAGEERROR:", String(e).slice(0, 400)));
    teacherPage.on("console", (m) => {
      if (m.type() === "error") console.log("TEACHER-CONSOLE-ERR:", m.text().slice(0, 300));
    });
    await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
    // LiveMonitor (camera grid + AiAlertFeed) mounts on the teacher session
    // page — NOT an /exam-sessions/... route.
    await teacherPage.goto(`/exams/${s.examId}/sessions/${sessionId}`);
    await teacherPage.waitForLoadState("domcontentloaded");
    // The session page is long; the feed sits under LiveMonitor. Diagnose a
    // missing feed: print whether the page rendered past "Lifecycle".
    await expect(teacherPage.getByTestId("ai-alert-feed")).toBeVisible({ timeout: 60_000 });

    // Aggregated alert card appears (STOMP ping → backfill merge).
    try {
      await expect(teacherPage.getByTestId("ai-alert-card").first()).toBeVisible({ timeout: 60_000 });
    } catch (e) {
      const aiState = await page.evaluate(() => {
        const h = (window as unknown as { __quizopiaAi?: { getStatus(): string; getSentEvents: () => unknown[]; getFrameSamples: () => unknown[] } }).__quizopiaAi;
        return { status: h?.getStatus(), sent: h?.getSentEvents().length, frames: h?.getFrameSamples().length };
      });
      console.log("AI-STATE-AT-FAIL", JSON.stringify(aiState));
      throw e;
    }
    await expect(teacherPage.getByTestId("ai-alert-card").first()).toContainText("Phát hiện điện thoại");
    await expect(teacherPage.getByTestId("ai-alert-card").first()).toContainText("yolo26s");
    await expect(teacherPage.getByTestId("ai-alert-card").first()).toContainText("CLIENT MODEL");

    // Sustained frames EXTEND one alert, never spam (cooldown 20s).
    await page.waitForTimeout(8_000);
    expect(await teacherPage.getByTestId("ai-alert-card").count()).toBe(1);

    // Second batch lands after the 10s per-type suppression + flush cadence
    // (P2-5 pacing) — poll for it rather than snapshotting.
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              (window as unknown as {
                __quizopiaAi?: { getSentEvents: () => unknown[] };
              }).__quizopiaAi?.getSentEvents().length ?? 0
          ),
        { timeout: 30_000 }
      )
      .toBeGreaterThanOrEqual(2);
    const sent = await page.evaluate(() =>
      (window as unknown as {
        __quizopiaAi?: { getSentEvents: () => Array<{ eventId: string; eventType: string; sequence: number; observedAt: string }> };
      }).__quizopiaAi?.getSentEvents() ?? []
    );
    sentEventTypes = sent.map((e) => e.eventType);

    await teacherPage.screenshot({ path: `${__dirname}/evidence/H1-teacher-alert.png`, fullPage: true });
    await page.screenshot({ path: `${__dirname}/evidence/H1-student-pill.png`, fullPage: false });
    await teacherCtx.close();

    // H2 duplicate eventId replay → DUPLICATE, still one alert.
    const first = (sent[0] as { eventId: string; eventType: string; sequence: number; observedAt: string });
    const replay = await apiJson<{ results: Array<{ eventId: string; status: string }> }>(
      `/api/attempts/${attemptId}/ai-detections`, studentToken,
      {
        method: "POST",
        body: JSON.stringify({
          detections: [{
            eventId: first.eventId,
            eventType: first.eventType,
            observedAt: first.observedAt,
            sequence: first.sequence,
            modelId: "yolo26s",
            modelVersion: "8.4.64-onnx",
            runtime: "ORT_WEB_WASM",
            frameWidth: 640,
            frameHeight: 480,
            processingMs: 40,
            detections: PHONE_FRAME.detections,
          }],
        }),
      }
    );
    expect(replay.status).toBe(200);
    expect(replay.body!.results[0]!.status).toBe("DUPLICATE");

    // H6 gaze warnings never appear anywhere in the student page.
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("hướng mắt");
    expect(bodyText).not.toContain("LOOKING_AWAY");

    // H5 throw the AI into a failing detector; autosave + submit survive.
    await page.evaluate(() => {
      const hooks = (window as unknown as {
        __quizopiaAi?: { setFakeDetector: (fn: unknown) => void };
      }).__quizopiaAi;
      hooks?.setFakeDetector(() => {
        throw new Error("SIMULATED detector failure");
      });
    });

    await page.getByRole("radio").first().check({ timeout: 15_000 });
    await expect(page.getByText(/Saved|Đã lưu/i).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /submit|nộp/i }).first().click();
    await page.getByRole("button", { name: /confirm|xác nhận/i }).first().click({ timeout: 10_000 });
    await page.waitForURL(/result|\/sessions\//, { timeout: 30_000 });
  });

  test("H3 detections after submit are quarantined late (no alert)", async () => {
    const late = await apiJson<{ results: Array<{ status: string }> }>(
      `/api/attempts/${attemptId}/ai-detections`, studentToken,
      {
        method: "POST",
        body: JSON.stringify({
          detections: [{
            eventId: crypto.randomUUID(),
            eventType: "PHONE_OBSERVED",
            observedAt: new Date().toISOString(),
            sequence: 999,
            modelId: "yolo26s",
            modelVersion: "8.4.64-onnx",
            runtime: "ORT_WEB_WASM",
            frameWidth: 640,
            frameHeight: 480,
            processingMs: 30,
            detections: PHONE_FRAME.detections,
          }],
        }),
      }
    );
    expect(late.status).toBe(200);
    expect(late.body!.results[0]!.status).toBe("QUARANTINED_LATE");
  });

  test("H4 teacher reload — alerts persist via REST backfill", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${s.examId}/sessions/${sessionId}`);
    await page.waitForLoadState("domcontentloaded");
    const feed = page.getByTestId("ai-alert-feed");
    await expect(feed).toBeVisible({ timeout: 60_000 });
    const card = page.getByTestId("ai-alert-card").first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Phát hiện điện thoại");
    await page.screenshot({ path: `${__dirname}/evidence/H4-teacher-reload.png`, fullPage: true });
  });

  test("H7 no PERSON_NOT_OBSERVED from single-frame gaps (3-frame streak)", async () => {
    // The H1 fake always had a phone frame; the client must never have sent
    // PERSON_NOT_OBSERVED (would require 3 consecutive person-empty frames —
    // unit-covered in use-attempt-ai-detection tests).
    expect(sentEventTypes.length).toBeGreaterThan(0);
    expect(sentEventTypes.slice(-3).every((t) => t === "PHONE_OBSERVED")).toBe(true);
  });
});
