import { expect, test, type Browser, type Page } from "@playwright/test";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { SeededUser, SmokeState } from "./helpers";

/**
 * Scenario P — P4-D Evidence & Recording (issues #91–#94), REAL media path.
 *
 * P1 Recording OFF + Clips ON: the student's (fake-device) camera publishes a
 *    REAL track; the backend starts REAL LiveKit egress pulses into REAL
 *    MinIO; a simulated detection opens an alert; the hook's REAL frame
 *    capture uploads a REAL JPEG (CLIENT_CAPTURE); the teacher sees the
 *    snapshot labeled honestly and requests a clip cut from the REAL rolling
 *    footage (ffmpeg) — AVAILABLE or honestly PARTIAL, never fabricated.
 * P2 Recording indicator: the student sees the rolling-buffer notice while
 *    recording is OFF (the recording-ON wording is unit-covered).
 * P3 Honest states: teacher evidence panel empty state before any alert;
 *    NO_COVERAGE clip text is service-level asserted (backend suite) and the
 *    UI renders evidence.error verbatim (unit-covered).
 *
 * Requires the dev media stack: livekit + egress (--profile egress) + MinIO
 * with QUIZOPIA_EVIDENCE_* env on the backend and ffmpeg on its PATH.
 */
test.describe("Scenario P — evidence & recording (REAL media path)", () => {
  let s: SmokeState;
  let student: SeededUser;
  let sessionId = 0;
  let examId = 0;

  test.beforeAll(async () => {
    s = state();
    examId = s.examId;
    // dedicated student so the P4-C alert history of the seeded student
    // never bleeds into this run's assertions
    student = await registerVerifiedUser("STUDENT", "p4dstudent");
    await apiJson(`/api/classrooms/${s.classroomId}/members`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({ userIds: [student.id] }),
    });
  });

  async function createMonitoredSession(recording: boolean): Promise<number> {
    const res = await apiJson<{ id: number; version: number }>(
      `/api/exams/${examId}/sessions`,
      s.teacher.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: `P4D ${recording ? "recording" : "clips"}`,
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
            fullRecordingEnabled: recording,
            evidenceClipsEnabled: true,
          },
        }),
      }
    );
    expect(res.status, `session create failed: ${res.raw}`).toBe(201);
    const id = res.body?.id ?? 0;
    // Scenario-H lifecycle: DRAFT → SCHEDULE → OPEN (direct open is a 409).
    await apiJson(`/api/exams/${examId}/sessions/${id}/schedule`, s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({}) });
    const opened = await apiJson(
      `/api/exams/${examId}/sessions/${id}/open`,
      s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({}) }
    );
    expect(opened.status, `session open failed: ${opened.raw}`).toBe(200);
    return id;
  }

  async function openStudentAttempt(browser: Browser, sid: number): Promise<Page> {
    const page = await browser.newPage();
    // Scenario-H fake-detector seam: install at DOCUMENT START with the
    // poll-until-registry pattern (assigning a bare object would CLOBBER the
    // app's registry and kill the hook). Frames are SIMULATED; the snapshot
    // capture + transport below are REAL.
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
          hooks.setFakeDetector(() => ({ ...frame, capturedAt: Date.now() }));
        } else {
          setTimeout(install, 150);
        }
      };
      install();
    });
    await loginViaUi(page, student.email, student.password);
    await page.goto(`/sessions/${sid}`);
    const preflight = page.getByTestId("camera-preflight");
    await expect(preflight).toBeVisible();
    await preflight.getByRole("button", { name: "Enable camera" }).click();
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start the attempt" }).click();
    await expect(page).toHaveURL(/\/attempts\/\d+/, { timeout: 30_000 });
    return page;
  }

  test("P1+P2 rolling buffer, real snapshot upload, real clip extraction", async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000);
    const sid = await createMonitoredSession(false);
    sessionId = sid;
    const studentPage = await openStudentAttempt(browser, sid);

    // REAL frame capture + upload fired by the FIRST alert (the fake
    // detector flows PHONE frames from frame 1) — assert before the pulse
    // wait because the pill suffix is transient.
    await expect(
      studentPage.getByTestId("ai-status-pill").getByText(/Đã gửi ảnh minh chứng/),
    ).toBeVisible({ timeout: 30_000 });

    // P2: honest notice while recording is OFF + clips ON.
    await expect(
      studentPage.getByTestId("recording-status-pill").getByText(/lưu đệm/i),
    ).toBeVisible({ timeout: 20_000 });

    // Real rolling pulses: wait past the first pulse completion (120 s) so
    // BOUNDED footage accumulates for the clip (buffer existed before the
    // alert by construction — pulses start at attempt start, the alert at
    // frame 1).
    await studentPage.waitForTimeout(155_000);

    // Teacher: alert card + honest evidence panel + real clip.
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${examId}/sessions/${sid}`);
    await expect(page.getByText("Phone detected").first()).toBeVisible({
      timeout: 30_000,
    });

    const evidence = page.getByTestId("evidence-section");
    await expect(evidence.getByText("Student-submitted image").first()).toBeVisible({
      timeout: 30_000,
    });

    await evidence.getByRole("button", { name: /generate clip/i }).first().click();
    // The REAL outcome must be a REAL clip: AVAILABLE ("Xem clip") or
    // honestly PARTIAL ("một phần") with the pre-roll gap. NO_COVERAGE here
    // is a FAILURE of this spec's premise (footage must exist — pulses run
    // from attempt start), never an acceptable pass.
    await expect(
      evidence.getByText(/view clip|partial clip/i).first(),
    ).toBeVisible({ timeout: 90_000 });

    await studentPage.close();
  });

  test("P3 teacher evidence panel empty state before any alert", async ({ page }) => {
    const sid = await createMonitoredSession(false);
    sessionId = sid;
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${examId}/sessions/${sid}`);
    await expect(
      page.getByTestId("evidence-section").getByText(/no alerts|no evidence/i),
    ).toBeVisible({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    if (sessionId) {
      // best-effort close via the exam-session endpoint shape used by D
      await apiJson(`/api/exams/${examId}/sessions/${sessionId}/close`, s.teacher.accessToken, {
        method: "POST",
        body: JSON.stringify({}),
      }).catch(() => undefined);
    }
  });
});
