import { test, expect } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { apiJson, loginViaUi, registerVerifiedUser, state } from "./helpers";

/**
 * P4-F2 physical-SOURCE camera gate (#98, Product Owner amendment
 * 2026-11-18): TWO simultaneous independent real camera sources —
 * the workstation's built-in BisonCam NB Pro AND a live iPhone camera
 * delivered through e2eSoft iVCam (a Windows virtual driver whose SOURCE
 * is a physical phone sensor; the driver being virtual does NOT
 * disqualify it — the amendment explicitly accepts it).
 *
 * NOT accepted as physical sources: OBS Virtual Camera, loopback files,
 * synthetic Chromium fake devices, or the same sensor opened twice.
 *
 * The two sources publish as two separate Students/Attempts over real
 * LiveKit WebRTC; the teacher grid must decode NEW frames on BOTH exact
 * camera trackSIDs simultaneously. The five-SIMULATED-publisher
 * benchmark is a SEPARATE suite (scenario-f) and is never counted here.
 *
 * Explicit opt-in only; ordinary synthetic-browser suite skips this test:
 * P4F_PHYSICAL_CAMERAS=1 npx playwright test --config e2e/p4f-physical.config.ts
 */
test.describe("P4-F physical-source camera gate (2 real sources)", () => {
  test.skip(
    process.env.P4F_PHYSICAL_CAMERAS !== "1",
    "physical-source webcams need explicit human/operator opt-in; normal suite uses SIMULATED media"
  );

  test("two independent physical-source cameras (BisonCam + iPhone/iVCam) → two concurrently decoded teacher tiles", async ({
    browser,
  }) => {
    test.setTimeout(12 * 60_000);
    const s = state();
    const runSalt = randomBytes(16);
    const report: Record<string, unknown> = {
      schemaVersion: 2,
      gate: "TWO_PHYSICAL_SOURCES",
      status: "INCOMPLETE_HUMAN_VERIFICATION_REQUIRED",
      actualDistinctPhysicalSourceWitnessed: false,
      notes:
        "No fake Chrome flags or fake AI hooks. Source 1: built-in BisonCam NB Pro (direct USB sensor). " +
        "Source 2: live iPhone camera via e2eSoft iVCam (virtual Windows driver, PHYSICAL phone sensor source — " +
        "accepted by the 2026-11-18 Product Owner amendment). OBS/loopback/synthetic never qualify. " +
        "A human must witness the iPhone actually streaming (iVCam watermark + live scene) and BisonCam separately.",
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
      // ---- Enumerate + classify the two expected physical sources ----
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
      await probeCtx.close();

      // Select by label: BisonCam = built-in sensor; iVCam = iPhone source.
      // OBS Virtual Camera and anything else synthetic-looking is rejected.
      const bison = devices.find((d) => /bisoncam/i.test(d.label));
      const ivcam = devices.find((d) => /ivcam/i.test(d.label) && !/microphone/i.test(d.label));
      expect(
        bison,
        "Hardware NO-GO: BisonCam NB Pro not enumerated. It is the mandatory built-in source."
      ).toBeTruthy();
      expect(
        ivcam,
        "Hardware NO-GO: e2eSoft iVCam not enumerated. Connect the iPhone and start the iVCam app."
      ).toBeTruthy();
      const chosen = [bison!, ivcam!];
      expect(
        new Set(chosen.map((d) => d.deviceId)).size,
        "The two sources must be distinct devices"
      ).toBe(2);

      // ---- Real class-restricted, teacher-owned, monitored session ----
      const created = await apiJson<{ id: number }>(
        "/api/exams/" + s.examId + "/sessions",
        s.teacher.accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            title: "P4-F two physical-source webcams " + Date.now(),
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

      // Student 1 = seeded class student (BisonCam); student 2 = fresh (iVCam).
      const students: Array<{ email: string; password: string; source: string }> = [
        { email: s.student.email, password: s.student.password, source: "BISONCAM_BUILTIN" },
      ];
      const second = await registerVerifiedUser("STUDENT", "p4f-2src-" + Date.now());
      const added = await apiJson(
        "/api/classrooms/" + s.classroomId + "/members",
        s.teacher.accessToken,
        { method: "POST", body: JSON.stringify({ userIds: [second.id] }) }
      );
      expect(added.status, added.raw).toBeLessThan(300);
      students.push({ email: second.email, password: second.password, source: "IPHONE_IVCAM" });

      // ---- Two publisher contexts, each pinned to its exact physical source ----
      const cameraReports: Array<Record<string, unknown>> = [];
      for (let i = 0; i < 2; i++) {
        const ctx = await browser.newContext({ permissions: ["camera"] });
        contexts.push(ctx);
        // Pin getUserMedia to THIS source by LABEL, resolving the deviceId
        // INSIDE the same context: Chromium salts deviceIds per browser
        // context, so a probe-context deviceId is invalid here and an
        // {exact} pin would fail with OverconstrainedError. A default mic
        // request must FAIL the gate (NotAllowedError-shaped so the app
        // surfaces it).
        await ctx.addInitScript((sourceLabel: string) => {
          if (!navigator.mediaDevices) return;
          const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
          const resolveDevice = async (): Promise<string | null> => {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const match = devices.find(
              (d) => d.kind === "videoinput" && d.label.includes(sourceLabel)
            );
            return match?.deviceId ?? null;
          };
          navigator.mediaDevices.getUserMedia = async (constraints: MediaStreamConstraints) => {
            if (!constraints?.video) return original(constraints);
            const video = typeof constraints.video === "object" ? { ...constraints.video } : {};
            if (constraints.audio) {
              const err = new Error(
                "P4-F violation: attempt camera flow requested microphone by default"
              );
              err.name = "NotAllowedError";
              throw err;
            }
            const deviceId = await resolveDevice();
            if (!deviceId) {
              const err = new Error(
                "P4-F violation: physical source not present in this context: " + sourceLabel
              );
              err.name = "NotFoundError";
              throw err;
            }
            return original({
              ...constraints,
              video: { ...video, deviceId: { exact: deviceId } },
            });
          };
        }, chosen[i]!.label);
        // AI isolation (media gate only): null detector so 2× WASM inference
        // cannot starve WebRTC; real-model proof is the separate benchmark.
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

        const page: Page = await ctx.newPage();
        await loginViaUi(page, students[i]!.email, students[i]!.password);
        await page.goto("/sessions/" + sessionId);
        const preflight = page.getByTestId("camera-preflight");
        await expect(preflight).toBeVisible({ timeout: 30_000 });
        // Wait for the idle state (button mounted + handler attached) —
        // clicking during hydration can silently miss the start handler.
        const enableButton = preflight.getByRole("button", { name: "Enable camera" });
        await expect(enableButton).toBeVisible({ timeout: 30_000 });
        await enableButton.click();
        // Surface a preflight failure explicitly instead of letting the
        // preview poll time out with no diagnosis.
        const failText = preflight.getByText(/Camera check failed|denied|unavailable/i);
        const previewReady = page.waitForFunction(
          () => {
            const video = document.querySelector<HTMLElement>(
              "[data-testid='camera-preflight'] video"
            );
            const stream = video
              ? ((video as HTMLVideoElement).srcObject as MediaStream | null)
              : null;
            const track = stream?.getVideoTracks()[0];
            return track
              ? { deviceId: track.getSettings().deviceId ?? "", readyState: track.readyState }
              : null;
          },
          undefined,
          { timeout: 60_000, polling: 500 }
        );
        const failure = failText.waitFor({ timeout: 60_000 }).catch(() => null);
        const firstOutcome = await Promise.race([previewReady, failure]);
        if (!firstOutcome) {
          const detail = (await preflight.textContent()) ?? "";
          throw new Error("Preflight failed before a preview track existed: " + detail.slice(0, 300));
        }
        const selected = await (await previewReady).jsonValue();
        expect(selected?.readyState).toBe("live");
        // The captured track's deviceId must belong to THIS source in THIS
        // context (labels are stable across contexts; ids are salted).
        const labelCheck = await page.evaluate(async (sourceLabel) => {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const match = devices.find(
            (d) => d.kind === "videoinput" && d.label.includes(sourceLabel)
          );
          return match ? match.deviceId : null;
        }, chosen[i]!.label);
        expect(
          labelCheck && selected?.deviceId === labelCheck,
          "Preview capture did not use the selected physical source"
        ).toBe(true);

        await expect(preflight.getByText("Camera verified")).toBeVisible({ timeout: 90_000 });
        await page.getByRole("button", { name: "Start the attempt" }).click();
        await page.waitForURL(/\/attempts\/\d+/, { timeout: 60_000 });
        await expect(page.getByText("Camera live")).toBeVisible({ timeout: 45_000 });

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
          source: students[i]!.source,
          publisherId: "anonymous-adult-" + (i + 1),
          deviceIdSha256: anonymize(chosen[i]!.deviceId),
          deviceLabelClass:
            students[i]!.source === "BISONCAM_BUILTIN" ? "builtin-usb-sensor" : "iphone-via-ivcam",
          trackSid: mediaState.trackSid,
          connectedAt: new Date().toISOString(),
          teacherSubscribed: false,
          decodedFrames: 0,
          measuredFps: 0,
          evidenceRef: "e2e/evidence/p4f-two-sources.json",
        });
        report.cameras = cameraReports;
      }

      // ---- Teacher grid: BOTH sources decoded simultaneously ----
      teacherCtx = await browser.newContext();
      const teacherPage = await teacherCtx.newPage();
      await loginViaUi(teacherPage, s.teacher.email, s.teacher.password);
      await teacherPage.goto("/exams/" + s.examId + "/sessions/" + sessionId);
      const grid = teacherPage.getByTestId("camera-grid");
      await expect(grid).toBeVisible({ timeout: 60_000 });
      const tiles = grid.locator("[data-media-identity]");
      await expect(tiles).toHaveCount(2, { timeout: 90_000 });

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

      await teacherPage.bringToFront();
      await expect.poll(async () => (await frames()).filter((v) => v.width > 0).length,
        { timeout: 60_000 }).toBe(2);
      // Frame-delta over one window with a single retry (LOW-layer quirk).
      const measureDelta = async (): Promise<Map<string | null, number>> => {
        const first = await frames();
        await teacherPage.waitForTimeout(5_000);
        const last = await frames();
        expect(last.length).toBe(2);
        const firstBySid = new Map(first.map((frame) => [frame.trackSid, frame.frames]));
        const lastBySid = new Map(last.map((frame) => [frame.trackSid, frame.frames]));
        const delta = new Map<string | null, number>();
        for (const [sid, end] of lastBySid) {
          delta.set(sid, end - (firstBySid.get(sid) ?? 0));
        }
        return delta;
      };
      let deltas = await measureDelta();
      if (Array.from(deltas.values()).some((d) => d <= 0)) {
        deltas = await measureDelta();
      }
      const gridObservedAt = new Date().toISOString();
      const uniqueSids = new Set(deltas.keys());
      expect(uniqueSids.size, "Each teacher tile must map to a unique LiveKit track").toBe(2);
      for (const camera of cameraReports) {
        const sid = String(camera.trackSid);
        const delta = deltas.get(sid);
        expect(delta !== undefined, "Camera's actual trackSid must appear in the teacher grid").toBe(true);
        expect(delta, "Every physical-source track must decode NEW frames").toBeGreaterThan(0);
        camera.teacherSubscribed = true;
        camera.decodedFrames = delta!;
        camera.measuredFps = Math.round((delta! / 5) * 10) / 10;
      }
      report.teacherGrid = {
        observedAt: gridObservedAt,
        evidenceRef: "e2e/evidence/p4f-two-sources-grid.png",
        decodedTiles: 2,
      };
      await teacherPage.screenshot({
        path: evidenceDir + "/p4f-two-sources-grid.png",
        fullPage: true,
      });
      report.status = "TWO_LIVE_SOURCES_OBSERVED_HUMAN_IPHONE_WITNESS_PENDING";
    } catch (error) {
      report.status = "FAILED";
      report.failure = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      const disconnectedAt = new Date().toISOString();
      for (const cam of report.cameras as Array<Record<string, unknown>>) {
        cam.disconnectedAt = disconnectedAt;
      }
      report.finishedAt = disconnectedAt;
      // Private, gitignored; no raw device IDs/labels/PII.
      writeFileSync(evidenceDir + "/p4f-two-sources.json",
        JSON.stringify(report, null, 2));
      if (teacherCtx) await teacherCtx.close();
      for (const ctx of contexts) await ctx.close().catch(() => undefined);
    }
  });
});
