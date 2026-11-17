import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";
import type { SeededUser, SmokeState } from "./helpers";

/**
 * Scenario P2 — P2-1 final-gate acceptance: Full Recording ON, REAL media.
 *
 * R1 camera publishes a REAL (fake-device) track via LiveKit WebRTC; the
 *    backend starts a REAL egress FULL run; an MP4 lands in MinIO.
 * R2 student reloads (real reconnect) → the first segment FINALIZES and a
 *    second segment starts; submit stops recording.
 * R3 server-side truth: teacher recordings API shows ≥2 COMPLETE segments
 *    with an honest gap between them; the presigned URL downloads a file
 *    that ffprobe verifies as VALID VIDEO WITH NO AUDIO STREAM.
 * R4 teacher PLAYS the recording in the browser (video seek works).
 *
 * FakeEgressGateway unit/integration tests do NOT count as evidence for
 * this scenario — the dev egress container must be running (--profile
 * egress), MinIO reachable, ffmpeg/ffprobe available (SMOKE_FFPROBE or
 * PATH).
 */
const FFPROBE = process.env.SMOKE_FFPROBE ?? "ffprobe";

interface SegmentRow {
  jobId: string;
  kind: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  bytes: number | null;
  objectDeleted: boolean;
}

test.describe("Scenario P2 — full recording ON (REAL egress)", () => {
  let s: SmokeState;
  let student: SeededUser;
  let sessionId = 0;
  let attemptId = 0;

  test.beforeAll(async () => {
    s = state();
    student = await registerVerifiedUser("STUDENT", "p2recstudent");
    await apiJson(`/api/classrooms/${s.classroomId}/members`, s.teacher.accessToken, {
      method: "POST",
      body: JSON.stringify({ userIds: [student.id] }),
    });
  });

  async function createRecordingOnSession(): Promise<void> {
    const res = await apiJson<{ id: number }>(
      `/api/exams/${s.examId}/sessions`,
      s.teacher.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: `P4D P2 recording-ON ${Date.now()}`,
          startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
          maxAttempts: 1,
          visibility: "CLASS_RESTRICTED",
          classroomIds: [s.classroomId],
          monitoring: {
            monitoringEnabled: true,
            aiDetectionEnabled: true,
            activityTrackingEnabled: true,
            evidenceSnapshotsEnabled: false,
            fullRecordingEnabled: true,
            evidenceClipsEnabled: false,
          },
        }),
      }
    );
    expect(res.status, res.raw ?? "").toBeLessThan(300);
    sessionId = res.body!.id;
    await apiJson(
      `/api/exams/${s.examId}/sessions/${sessionId}/schedule`,
      s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({}) }
    );
    await apiJson(
      `/api/exams/${s.examId}/sessions/${sessionId}/open`,
      s.teacher.accessToken,
      { method: "POST", body: JSON.stringify({}) }
    );
  }

  async function startAttemptAsStudent(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    await loginViaUi(page, student.email, student.password);
    await page.goto(`/sessions/${sessionId}`);
    const preflight = page.getByTestId("camera-preflight");
    await expect(preflight).toBeVisible();
    await preflight.getByRole("button", { name: "Enable camera" }).click();
    await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Start the attempt" }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    attemptId = Number(new URL(page.url()).pathname.split("/")[2]);
    // honest policy indicator: recording ON
    await expect(
      page.getByTestId("recording-status-pill").getByText(/được ghi hình/i),
    ).toBeVisible({ timeout: 20_000 });
    return page;
  }

  async function segments(): Promise<SegmentRow[]> {
    const res = await apiJson<SegmentRow[]>(
      `/api/exam-sessions/${sessionId}/recordings`,
      s.teacher.accessToken
    );
    expect(res.status).toBe(200);
    return res.body ?? [];
  }

  async function downloadViaUrl(jobId: string): Promise<{ bytes: Buffer; url: string }> {
    const res = await apiJson<{ url: string }>(
      `/api/exam-sessions/${sessionId}/recordings/${jobId}/url`,
      s.teacher.accessToken
    );
    expect(res.status, `url mint failed: ${res.raw}`).toBe(200);
    const body = await fetch(res.body!.url);
    expect(body.status).toBe(200);
    const buf = Buffer.from(await body.arrayBuffer());
    return { bytes: buf, url: res.body!.url };
  }

  test("R1–R4 real recording lifecycle with reconnect gap and honest playback", async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000);
    await createRecordingOnSession();

    // R1: attempt starts, FULL egress runs against the real track.
    const studentPage = await startAttemptAsStudent(browser);
    await expect
      .poll(
        async () =>
          (await segments()).some((x) => x.status === "ACTIVE" || x.status === "STARTING"),
        { timeout: 60_000 }
      )
      .toBe(true);

    // R2: REAL reconnect — let segment 1 accumulate real footage first
    // (~25 s), then reload: the track closes (segment 1 finalizes) and the
    // resume re-publishes (segment 2 starts).
    await studentPage.waitForTimeout(25_000);
    await studentPage.reload();
    await studentPage.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    await expect(
      studentPage.getByTestId("recording-status-pill"),
    ).toBeVisible({ timeout: 30_000 });
    await studentPage.waitForTimeout(30_000);

    // submit stops recording (server-confirmed on the real path)
    await studentPage.getByRole("button", { name: /submit|nộp/i }).first().click();
    // force: an autosave toast can briefly overlay the confirm dialog
    await studentPage
      .getByRole("button", { name: /confirm|xác nhận/i })
      .first()
      .click({ timeout: 30_000, force: true });

    // R3: server truth — ≥2 COMPLETE FULL segments with an honest gap.
    await expect
      .poll(
        async () =>
          (await segments()).filter(
            (x) => x.kind === "FULL" && x.status === "COMPLETE" && (x.bytes ?? 0) > 0
          ).length,
        { timeout: 120_000 }
      )
      .toBeGreaterThanOrEqual(2);
    const rows = (await segments()).filter(
      (x) => x.kind === "FULL" && x.status === "COMPLETE" && x.startedAt && x.endedAt
    );
    rows.sort((a, b) => a.startedAt!.localeCompare(b.startedAt!));
    const gapMs =
      new Date(rows[1].startedAt!).getTime() - new Date(rows[0].endedAt!).getTime();
    expect(gapMs).toBeGreaterThan(2_000); // real reconnect gap, honestly visible

    // R3: presigned download + ffprobe — valid MP4, NO audio stream.
    const { bytes } = await downloadViaUrl(rows[0].jobId);
    expect(bytes.length).toBeGreaterThan(50_000);
    const tmp = join(tmpdir(), `p2-${rows[0].jobId}.mp4`);
    writeFileSync(tmp, bytes);
    const probe = execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration",
        "-of", "default=noprint_wrappers=1", tmp],
      { encoding: "utf8", timeout: 30_000 }
    );
    expect(probe).toContain("codec_type=video");
    expect(probe).not.toContain("codec_type=audio");
    expect(parseFloat(/duration=([\d.]+)/.exec(probe)![1])).toBeGreaterThan(5);

    // R4: teacher PLAYS the segment in the browser and can seek.
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${s.examId}/sessions/${sessionId}`);
    const card = page.getByTestId("recordings-card");
    await card.getByRole("button", { name: /xem ghi hình/i }).first().click();
    await card.getByRole("button", { name: /^Phát$/ }).first().click();
    const video = card.locator("video").first();
    await expect(video).toBeVisible({ timeout: 30_000 });
    await expect(video).toHaveJSProperty("readyState", 4, { timeout: 60_000 } as never);
    await video.evaluate((el) => (el as HTMLVideoElement).play());
    await page.waitForTimeout(1_500);
    // Seek commits asynchronously — Chrome clamps an unbuffered seek back
    // to the current position, so the assertion must POLL until the seek
    // lands (a synchronous read right after the set is a race).
    await video.evaluate((el) => {
      (el as HTMLVideoElement).currentTime = 3;
    });
    await expect
      .poll(
        async () =>
          video.evaluate((el) => (el as HTMLVideoElement).currentTime),
        { timeout: 20_000, intervals: [500] }
      )
      .toBeGreaterThanOrEqual(2.9);
    await page.screenshot({ path: `${__dirname}/evidence/P2-recording-playback.png`, fullPage: true });

    await studentPage.close();
  });

  test.afterAll(async () => {
    if (sessionId) {
      await apiJson(
        `/api/exams/${s.examId}/sessions/${sessionId}/close`,
        s.teacher.accessToken,
        { method: "POST", body: JSON.stringify({}) }
      ).catch(() => undefined);
    }
  });
});
