import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";

/**
 * P4-F physical-webcam HARDWARE gate (#98) — ONE local workstation with
 * at least five distinct attached physical cameras. No synthetic device
 * launch flags or fake model hooks. The 5-laptop alternative remains a
 * witnessed manual procedure in System/docs/phase4/DEMO_RUNBOOK.md.
 *
 * CAUTION: enumerateDevices and labels alone cannot prove cameras are
 * physically distinct; an independent adult must witness their actual
 * hardware serials offline. This spec produces private anonymized candidates,
 * NEVER an automatic Phase-4 acceptance verdict.
 *
 * Explicit opt-in only; ordinary synthetic-browser suite skips this test:
 * P4F_PHYSICAL_CAMERAS=1 npx playwright test --config e2e/p4f-physical.config.ts
 */
test.describe("P4-F physical camera gate, no fake media", () => {
  test.skip(
    process.env.P4F_PHYSICAL_CAMERAS !== "1",
    "physical webcams need explicit human/operator opt-in; normal suite uses SIMULATED media"
  );

  test("five independent selected webcam capture tracks → five concurrently decoded teacher tiles", async ({
    browser,
  }) => {
    test.setTimeout(15 * 60_000);
    const s = state();
    const runSalt = randomBytes(16);
    const report: Record<string, unknown> = {
      schemaVersion: 1,
      status: "INCOMPLETE_HUMAN_VERIFICATION_REQUIRED",
      actualDistinctPhysicalDeviceWitnessed: false,
      notes:
        "No fake Chrome flags or fake AI hooks. Browser device identity is only a candidate. Human must verify five physical serials and other P4-F gates independently.",
      startedAt: new Date().toISOString(),
      cameras: [] as Array<Record<string, unknown>>,
    };
    const contexts: BrowserContext[] = [];
    let teacherCtx: BrowserContext | null = null;
    const evidenceDir = __dirname + "/evidence";
    mkdirSync(evidenceDir, { recursive: true });

    const anonymize = (deviceId: string): string =>
      createHash("sha256").update(runSalt).update(deviceId).digest("hex");

    try {
      // Start one acquisition solely to unlock labels/enumeration. It is
      // immediately stopped, and never counted as one of the five publishers.
      const probeCtx = await browser.newContext({ permissions: ["camera"] });
      contexts.push(probeCtx);
      const probePage = await probeCtx.newPage();
      await probePage.goto("/");
      const devices = await probePage.evaluate(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach((t) => t.stop());
        const entries = await navigator.mediaDevices.enumerateDevices();
        return entries
          .filter((d) => d.kind === "videoinput" && Boolean(d.deviceId))
          .map((d) => ({ deviceId: d.deviceId, label: d.label }));
      });
      // Virtual media is not a physical camera. Label heuristics are not
      // adequate proof, hence the final separate hardware witness.
      const candidates = devices.filter(
        (d) => !/virtual|fake|obs|loopback|manycam|screen capture/i.test(d.label)
      );
      const unique = [...new Map(candidates.map((d) => [d.deviceId, d])).values()];
      expect(
        unique.length,
        "Hardware NO-GO: five distinct physical webcam devices are not enumerated. " +
          "No synthetic substitution is permitted."
      ).toBeGreaterThanOrEqual(5);
      await probeCtx.close();

      // Real class-restricted, teacher-owned, monitored session.
      const created = await apiJson<{ id: number }>(
        "/api/exams/" + s.examId + "/sessions",
        s.teacher.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            title: "P4-F physical five webcams " + Date.now(),
            startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
            endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
            maxAttempts: 1,
            visibility: "CLASS_RESTRICTED",
            classroomIds: [s.classroomId],
            monitoring: { monitoringEnabled: true, activityTrackingEnabled: true },
          }),
        }
      );
      expect(created.status, created.raw).toBeLessThan(300);
      const sessionId = created.body!.id;
      report.sessionId = sessionId;
      for (const action of ("schedule,open").split(",")) {
        const response = await apiJson(
          "/api/exams/" + s.examId + "/sessions/" + sessionId + "/" + action,
          s.teacher.accessToken,
          { method: "POST" }
        );
        expect(response.status, response.raw).toBeLessThan(300);
      }

      const students: Array<{ email: string; password: string }> = [
        { email: s.student.email, password: s.student.password },
      ];
      for (let i = 1; i < 5; i++) {
        const student = await registerVerifiedUser("STUDENT", "p4f-physical-" + i + "-" + Date.now());
        const added = await apiJson(
          "/api/classrooms/" + s.classroomId + "/members",
          s.teacher.accessToken,
          { method: "POST", body: JSON.stringify({ userIds: [student.id] }) }
        );
        expect(added.status, added.raw).toBeLessThan(300);
        students.push({ email: student.email, password: student.password });
      }

      const cameraReports: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 5; i++) {
        const device = unique[i]!;
        const ctx = await browser.newContext({ permissions: ["camera"] });
        contexts.push(ctx);
        // App gets the genuine selected hardware sensor, not the browser's
        // default device reused five times; retain all other constraints.
        // No simulated tracks or synthetic camera implementation is injected.
        await ctx.addInitScript((chosenDeviceId: string) => {
          if (!navigator.mediaDevices) return;
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          navigator.mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) => {
            if (!constraints?.video) return original(constraints);
            const video = typeof constraints.video === "object" ? { ...constraints.video } : {};
            return original({
              ...constraints,
              audio: false,
              video: { ...video, deviceId: { exact: chosenDeviceId } },
            });
          };
        }, device.deviceId);
        const page: Page = await ctx.newPage();
        await loginViaUi(page, students[i]!.email, students[i]!.password);
        await page.goto("/sessions/" + sessionId);
        const preflight = page.getByTestId("camera-preflight");
        await preflight.getByRole("button", { name: "Enable camera" }).click();

        // Verify the actual browser MediaStreamTrack reports the selected
        // deviceId, not merely that a camera permission dialog was granted.
        const selected = await preflight.locator("video").first().evaluate((video) => {
          const stream = (video as HTMLVideoElement).srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()[0];
          return track
            ? { deviceId: track.getSettings().deviceId ?? "", readyState: track.readyState }
            : null;
        });
        expect(selected?.readyState).toBe("live");
        expect(selected?.deviceId, "Preview capture did not use selected hardware webcam").toBe(
          device.deviceId
        );

        await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 90_000 });
        await page.getByRole("button", { name: "Start the attempt" }).click();
        await page.waitForURL(/\/attempts\/\d+/, { timeout: 60_000 });
        await expect(page.getByText("Camera live")).toBeVisible({ timeout: 45_000 });
        const attemptId = Number(new URL(page.url()).pathname.split("/")[2]);

        // Read only track *type* and track SID; do not collect live tokens or
        // record device label, user email, raw camera ID, frames or faces.
        const mediaState = await page.evaluate(() => {
          const room = (window as unknown as {
            __quizopiaMedia?: { getRoom?: (role: string) => unknown };
          }).__quizopiaMedia?.getRoom?.("attempt");
          const pubs = (room as {
            localParticipant?: { trackPublications?: Map<string, { source?: string; trackSid?: string }> };
          } | null)?.localParticipant?.trackPublications;
          const camera = [...(pubs?.values() ?? [])].find((p) => p.source === "camera");
          const microphones = [...(pubs?.values() ?? [])].filter((p) => p.source === "microphone");
          return { trackSid: camera?.trackSid ?? null, microphoneCount: microphones.length };
        });
        expect(mediaState.trackSid, "Real LiveKit camera publication expected").toBeTruthy();
        expect(mediaState.microphoneCount, "No microphone by default").toBe(0);
        cameraReports.push({
          source: "UNVERIFIED_PHYSICAL_CANDIDATE",
          publisherId: "anonymous-adult-" + (i + 1),
          deviceIdSha256: anonymize(device.deviceId),
          trackSid: mediaState.trackSid,
          connectedAt: new Date().toISOString(),
          teacherSubscribed: false,
          decodedFrames: 0,
          measuredFps: 0,
          evidenceRef: "private/p4f-physical-candidate.json",
        });
        report.cameras = cameraReports;
        void attemptId;
      }

      teacherCtx = await browser.newContext();
      const teacherPage = await teacherCtx.newPage();
      await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
      await teacherPage.goto("/exams/" + s.examId + "/sessions/" + sessionId);
      const grid = teacherPage.getByTestId("camera-grid");
      await expect(grid).toBeVisible({ timeout: 60_000 });
      const tiles = grid.locator("[data-media-identity]");
      await expect(tiles).toHaveCount(5, { timeout: 90_000 });

      // Bind each teacher tile to the exact LiveKit CAMERA trackSid of its
      // remote participant, not an assumed DOM tile order. Otherwise sorting
      // or grid reordering could falsely attribute one webcam's frame count
      // to a different participant.
      const frames = async (): Promise<
        Array<{ trackSid: string | null; width: number; frames: number }>
      > =>
        teacherPage.evaluate(() => {
          const room = (window as unknown as {
            __quizopiaMedia?: { getRoom?: (role: string) => unknown };
          }).__quizopiaMedia?.getRoom?.("teacher");
          const remote = (room as {
            remoteParticipants?: Map<string, {
              trackPublications?: Map<string, { source?: string; trackSid?: string }>;
            }>;
          } | null)?.remoteParticipants;
          return Array.from(
            document.querySelectorAll<HTMLElement>(
              "[data-testid='camera-grid'] [data-media-identity]"
            )
          ).map((tile) => {
            const identity = tile.getAttribute("data-media-identity") ?? "";
            const participant = remote?.get(identity);
            const camera = Array.from(participant?.trackPublications?.values() ?? []).find(
              (pub) => pub.source === "camera"
            );
            const video = tile.querySelector("video");
            return {
              trackSid: camera?.trackSid ?? null,
              width: video?.videoWidth ?? 0,
              frames: video?.getVideoPlaybackQuality?.().totalVideoFrames ?? 0,
            };
          });
        });

      await expect.poll(async () => (await frames()).filter((v) => v.width > 0).length,
        { timeout: 60_000 }).toBe(5);
      const first = await frames();
      await teacherPage.waitForTimeout(5_000);
      const last = await frames();
      expect(last.length).toBe(5);
      const gridObservedAt = new Date().toISOString();
      const firstBySid = new Map(first.map((frame) => [frame.trackSid, frame]));
      const lastBySid = new Map(last.map((frame) => [frame.trackSid, frame]));
      expect(firstBySid.size, "Each teacher tile must map to a unique LiveKit track").toBe(5);
      for (const camera of cameraReports) {
        const sid = String(camera.trackSid);
        const a = firstBySid.get(sid);
        const b = lastBySid.get(sid);
        expect(a && b, "Camera's actual trackSid must appear in the teacher grid").toBeTruthy();
        const delta = b!.frames - a!.frames;
        expect(delta, "Every exact CAMERA track must decode NEW frames").toBeGreaterThan(0);
        camera.teacherSubscribed = true;
        camera.decodedFrames = delta;
        camera.measuredFps = Math.round((delta / 5) * 10) / 10;
      }
      report.teacherGrid = {
        observedAt: gridObservedAt,
        evidenceRef: "private/p4f-five-teacher-grid.png",
        decodedTiles: 5,
      };
      await teacherPage.screenshot({
        path: evidenceDir + "/p4f-five-teacher-grid.png",
        fullPage: true,
      });
      report.status = "FIVE_LIVE_TRACKS_OBSERVED_HUMAN_HARDWARE_ATTESTATION_PENDING";
    } finally {
      const disconnectedAt = new Date().toISOString();
      for (const cam of report.cameras as Array<Record<string, unknown>>) {
        cam.disconnectedAt = disconnectedAt;
      }
      report.finishedAt = disconnectedAt;
      // This JSON stays gitignored. It contains no raw device IDs or camera
      // labels and cannot pass the System manifest gate without human review.
      writeFileSync(evidenceDir + "/p4f-physical-candidate.json",
        JSON.stringify(report, null, 2));
      if (teacherCtx) await teacherCtx.close();
      for (const ctx of contexts) await ctx.close().catch(() => undefined);
    }
  });
});
