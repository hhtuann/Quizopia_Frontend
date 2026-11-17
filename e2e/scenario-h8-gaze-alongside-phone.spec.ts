import { test, expect } from "@playwright/test";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { SmokeState } from "./helpers";

/**
 * Scenario H8 — gaze + yolo26s pipelines TOGETHER, end to end (P4-C gaze
 * integration gate, after P4-E).
 *
 * Detector: FAKE (SIMULATED, labeled) — each fake frame carries BOTH the
 * object boxes (person + phone) AND a gaze reading, i.e. what the real chain
 * produces per analyzed frame. Real-model numbers live in
 * e2e/gaze-benchmark.mts; this spec covers the transport / backend V43 /
 * aggregation / teacher UI / P4-E review path for the new LOOKING_AWAY type.
 *
 * H8a the client sends PHONE_OBSERVED and, after auto-calibration + a
 *     sustained deviation, LOOKING_AWAY_OBSERVED (gaze model identity)
 * H8b the backend (V43) accepts it: the teacher feed shows TWO separate
 *     alerts — "Phát hiện điện thoại" and "Nhìn lệch khỏi màn hình" — the
 *     gaze card says it is a model estimate for the teacher's reference
 * H8c the P4-E review form works on the gaze alert (assessment, not verdict)
 * H8d nothing about gaze is ever shown to the student
 */
test.describe("Scenario H8 — gaze alongside phone detection (SIMULATED detector)", () => {
  let s: SmokeState;
  let sessionId = 0;
  let student = { email: "", password: "" };

  test.beforeAll(async () => {
    s = state();
    const res = await apiJson<{ id: number }>(`/api/exams/${s.examId}/sessions`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: `Smoke Gaze Session ${Date.now()}`,
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
    const u = await registerVerifiedUser("STUDENT", `gaze-stu-${Date.now()}`);
    const add = await apiJson(`/api/classrooms/${s.classroomId}/members`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({ userIds: [u.id] }),
    });
    expect(add.status, add.raw ?? "").toBeLessThan(300);
    student = { email: u.email, password: u.password };
  });

  test("H8 phone + LOOKING_AWAY reach the teacher as two alerts; gaze is reviewable and student-invisible", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    await page.addInitScript(() => {
      let t0 = 0;
      const install = (): void => {
        const hooks = (window as unknown as {
          __quizopiaAi?: { setFakeDetector: (fn: unknown) => void };
        }).__quizopiaAi;
        if (!hooks?.setFakeDetector) {
          setTimeout(install, 150);
          return;
        }
        hooks.setFakeDetector(() => {
          const now = Date.now();
          if (t0 === 0) t0 = now;
          // 0–8s: looking at the screen (baseline calibration);
          // afterwards: sustained look to the left (yaw −40°).
          const away = now - t0 > 8_000;
          return {
            detections: [
              { classId: 0, label: "person", confidence: 0.86, bbox: [0.18, 0.05, 0.82, 0.95] },
              { classId: 67, label: "cell phone", confidence: 0.91, bbox: [0.52, 0.42, 0.86, 0.78] },
            ],
            frameWidth: 640,
            frameHeight: 480,
            processingMs: 42,
            capturedAt: now,
            runtime: "ORT_WEB_WASM",
            simulated: true,
            gaze: {
              faceCount: 1,
              faceBox: [0.35, 0.15, 0.62, 0.55],
              faceScore: 0.93,
              faceWidthPx: 180,
              yaw: away ? -40 : 0,
              pitch: 2,
              processingMs: 35,
              runtime: "ORT_WEB_WASM",
            },
          };
        });
      };
      install();
    });

    await loginViaUi(page, student.email, student.password);
    await page.goto(`/sessions/${sessionId}`);
    const preflight = page.getByTestId("camera-preflight");
    await expect(preflight).toBeVisible();
    await preflight.getByRole("button", { name: "Enable camera" }).click();
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start the attempt" }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    await expect(page.getByText("Camera live")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ai-status-pill")).toContainText("SIMULATED", { timeout: 30_000 });

    // H8a — both event types leave the client.
    const sentTypes = async (): Promise<string[]> =>
      page.evaluate(
        () =>
          (window as unknown as {
            __quizopiaAi?: { getSentEvents: () => Array<{ eventType: string }> };
          }).__quizopiaAi?.getSentEvents().map((e) => e.eventType) ?? []
      );
    await expect.poll(sentTypes, { timeout: 90_000 }).toContain("PHONE_OBSERVED");
    await expect.poll(sentTypes, { timeout: 90_000 }).toContain("LOOKING_AWAY_OBSERVED");

    // H8b — teacher sees two distinct alerts.
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    teacherPage.on("pageerror", (e) => console.log("TEACHER-PAGEERROR:", String(e).slice(0, 400)));
    await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
    await teacherPage.goto(`/exams/${s.examId}/sessions/${sessionId}`);
    await expect(teacherPage.getByTestId("ai-alert-feed")).toBeVisible({ timeout: 60_000 });
    const cards = teacherPage.getByTestId("ai-alert-card");
    const phoneCard = cards.filter({ hasText: "Phát hiện điện thoại" });
    const gazeCard = cards.filter({ hasText: "Nhìn lệch khỏi màn hình" });
    await expect(phoneCard).toHaveCount(1, { timeout: 60_000 });
    await expect(gazeCard).toHaveCount(1, { timeout: 60_000 });
    await expect(phoneCard).toContainText("yolo26s");
    await expect(gazeCard).toContainText("mobilegaze-mobileone-s0");
    await expect(gazeCard.getByTestId("ai-alert-gaze")).toContainText("Nhìn lệch sang");
    await expect(gazeCard.getByTestId("ai-alert-gaze")).toContainText("chỉ để giáo viên tham khảo");
    await expect(teacherPage.getByTestId("ai-alert-feed")).toContainText(
      "không tự động kết luận vi phạm"
    );
    await teacherPage.screenshot({ path: `${__dirname}/evidence/H8-teacher-two-alerts.png`, fullPage: true });

    // H8c — P4-E review on the gaze alert.
    const reviewForm = gazeCard.getByTestId("alert-review-form");
    await expect(reviewForm).toBeVisible({ timeout: 30_000 });
    await reviewForm.getByRole("button", { name: "Báo động sai" }).click();
    await reviewForm.getByRole("textbox").fill("SIMULATED gaze reading — reviewed in H8");
    await reviewForm.getByRole("button", { name: "Lưu đánh giá" }).click();
    await expect(reviewForm.getByRole("status")).toBeVisible({ timeout: 30_000 });
    await expect(gazeCard).toContainText("Giảng viên đánh giá", { timeout: 30_000 });
    // The phone alert is untouched by the gaze review.
    await expect(phoneCard).not.toContainText("Giảng viên đánh giá");
    await teacherCtx.close();

    // H8d — the student never sees gaze observations.
    const bodyText = (await page.textContent("body")) ?? "";
    expect(bodyText).not.toContain("LOOKING_AWAY");
    expect(bodyText).not.toContain("Nhìn lệch");
  });
});
