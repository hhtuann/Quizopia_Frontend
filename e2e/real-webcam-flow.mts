import { chromium } from "@playwright/test";
import { promises as fs } from "node:fs";
import * as http from "node:http";

/**
 * REAL-WEBCAM acceptance flow (issue #86 amended criterion, P4-B gate):
 * one physical camera through the complete monitored pipeline —
 *
 *   Camera permission → Preview → LiveKit publish → Readiness lease →
 *   Start Attempt → Teacher Grid → Reconnect
 *
 * Unlike the synthetic-camera suite (playwright.config.ts fake-device
 * flags), this script launches Chromium WITHOUT any fake media flags and
 * asserts the acquired track is a REAL device (label + live settings).
 * Not part of the default Playwright run; execute explicitly:
 *
 *   SMOKE_REAL_WEBCAM=1 node e2e/real-webcam-flow.mts
 *
 * Requires: backend (PR #25 HEAD) on :8080 with LiveKit enabled, frontend
 * dev server on :3000, LiveKit stack up, Mailpit up. A fresh monitored
 * session is created via API; a fresh student is registered through the
 * real OTP flow.
 */
const API = "http://localhost:8080";
const MAILPIT = "http://localhost:8025";
const RUN = Date.now().toString(36);

function delay(ms: number) {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function apiJson<T>(path: string, token: string | null, init: { method?: string; body?: string } = {}): Promise<{ status: number; body: T | null; raw: string }> {
  // node:http instead of global fetch — undici stalls against this Tomcat
  // on some Windows hosts (same reason as e2e/helpers.ts).
  const url = new URL(API + path);
  const { promise, resolve, reject } = Promise.withResolvers<{ status: number; body: T | null; raw: string }>();
  const req = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: init.method ?? "GET",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: T | null = null;
        try {
          body = raw ? (JSON.parse(raw) as T) : null;
        } catch {
          body = null;
        }
        resolve({ status: res.statusCode ?? 0, body, raw });
      });
    }
  );
  req.on("error", reject);
  req.setTimeout(30_000, () => req.destroy(new Error("apiJson timeout")));
  if (init.body !== undefined) req.write(init.body);
  req.end();
  return promise;
}

async function registerVerifiedStudent(): Promise<{ email: string; password: string; accessToken: string; id: number }> {
  const username = `realcam-${RUN}`;
  const email = `${username}@quizopia-smoke.test`;
  const password = `Sm0ke!${RUN}aA`;
  const reg = await apiJson<{ id: number }>("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ username, email, password, displayName: "Real Cam Student", phone: "0000000000", accountType: "STUDENT" }),
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.raw}`);
  let otp = "";
  for (let i = 0; i < 20 && !otp; i++) {
    await delay(500);
    const list = (await fetch(`${MAILPIT}/api/v1/messages?limit=10`).then((r) => r.json())) as {
      messages?: Array<{ ID: string; To: Array<{ Address: string }> }>;
    };
    for (const m of list.messages ?? []) {
      if ((m.To ?? []).some((t) => t.Address === email)) {
        const msg = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json());
        const match = String(msg.Text ?? msg.HTML ?? "").match(/\b(\d{6})\b/);
        if (match) otp = match[1];
      }
    }
  }
  if (!otp) throw new Error("no OTP");
  await apiJson("/api/auth/verify-email", null, { method: "POST", body: JSON.stringify({ email, otp }) });
  const login = await apiJson<{ accessToken: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ identifier: email, password }),
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  return { email, password, accessToken: login.body!.accessToken, id: reg.body!.id };
}

async function main() {
  const state = JSON.parse(await fs.readFile(`${import.meta.dirname}/.smoke-state.json`, "utf8"));
  const teacherLogin = await apiJson<{ accessToken: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ identifier: state.teacher.email, password: state.teacher.password }),
  });
  const teacher = teacherLogin.body!.accessToken;

  // Fresh monitored classroom session.
  const created = await apiJson<{ id: number }>(`/api/exams/${state.examId}/sessions`, teacher, {
    method: "POST",
    body: JSON.stringify({
      title: `Real Webcam Session ${RUN}`,
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
      maxAttempts: 1,
      visibility: "CLASS_RESTRICTED",
      classroomIds: [state.classroomId],
      monitoring: { monitoringEnabled: true, activityTrackingEnabled: true },
    }),
  });
  if (created.status >= 300) throw new Error(`session create failed: ${created.status} ${created.raw}`);
  const sessionId = created.body!.id;
  await apiJson(`/api/exams/${state.examId}/sessions/${sessionId}/schedule`, teacher, { method: "POST" });
  await apiJson(`/api/exams/${state.examId}/sessions/${sessionId}/open`, teacher, { method: "POST" });

  const student = await registerVerifiedStudent();
  await apiJson(`/api/classrooms/${state.classroomId}/members`, teacher, {
    method: "POST",
    body: JSON.stringify({ userIds: [student.id] }),
  });

  // REAL camera launch: NO fake-device flags; permission granted via context.
  // Headed is REQUIRED: headless Chromium cannot open physical capture
  // devices on Windows (NotSupportedError) — only fake devices work there.
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (["error", "warning", "log"].includes(m.type())) {
      console.log("[page-console]", m.type(), m.text().slice(0, 240));
    }
  });
  page.on("pageerror", (e) => console.log("[page-error]", String(e).slice(0, 240)));

  const results: Record<string, unknown> = { sessionId };

  // --- Login + landing.
  await page.goto("http://localhost:3000/login");
  await page.fill("#identifier", student.email);
  await page.fill("#password", student.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"));
  await page.goto(`http://localhost:3000/sessions/${sessionId}`);

  const preflight = page.getByTestId("camera-preflight");
  await preflight.waitFor({ state: "visible", timeout: 20_000 });
  results.eligible = true;

  await page.getByTestId("camera-preflight").waitFor({ state: "visible", timeout: 20_000 });

  // Room-state sampler: the app's hook tears its room down on timeout, so
  // poll the registry DURING the run to see what the app's room lived like.
  await page.evaluate(() => {
    let tick = 0;
    setInterval(() => {
      tick += 1;
      const media = (window as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } }).__quizopiaMedia;
      const room = media?.getRoom?.("preflight");
      if (!room || typeof room !== "object") {
        console.log("[room-sample]", tick, "media-registry:", typeof media);
        return;
      }
      const r = room as {
        state?: string;
        localParticipant?: { trackPublications?: Map<string, unknown>; audioLevel?: number; sid?: string };
        engine?: { signalState?: string; pcManager?: { publisher?: { pc?: { connectionState?: string; iceConnectionState?: string } } } };
      };
      const pubs: string[] = [];
      for (const pub of r.localParticipant?.trackPublications?.values() ?? []) {
        if (typeof pub === "object" && pub !== null) {
          const p = pub as { source?: string; trackSid?: string; track?: { muted?: boolean; isStarted?: boolean; isEnabled?: boolean } };
          pubs.push(
            `${p.source}:sid=${p.trackSid ?? "NONE"}:started=${p.track?.isStarted ?? "no-track"}:enabled=${p.track?.isEnabled ?? "?"}`
          );
        }
      }
      const pc = r.engine?.pcManager?.publisher?.pc;
      const pv = document.querySelector<HTMLVideoElement>("[data-testid='camera-preflight'] video");
      const pvt = (pv?.srcObject as MediaStream | null)?.getVideoTracks()[0];
      const preview = pvt
        ? `ready=${pvt.readyState} muted=${pvt.muted} vw=${pv?.videoWidth}`
        : "no-preview-track";
      console.log(
        "[room-sample]",
        tick,
        `room=${r.state}`,
        `sig=${r.engine?.signalState ?? "?"}`,
        `pc=${pc?.connectionState ?? "?"}/${pc?.iceConnectionState ?? "?"}`,
        `preview=${preview}`,
        JSON.stringify(pubs)
      );
    }, 3000);
  });

  // --- Camera permission (real getUserMedia) → Preview.
  await preflight.getByRole("button", { name: "Enable camera" }).click();

  // Read the REAL track from the app's own preview <video> (srcObject) —
  // opening a SECOND getUserMedia would steal the device from the app on
  // single-open hardware (the BisonCam is exactly that) and kill the flow.
  const previewInfo = await page.waitForFunction(
    () => {
      const el = document.querySelector<HTMLVideoElement>("[data-testid='camera-preflight'] video");
      const src = el?.srcObject as MediaStream | null;
      const track = src?.getVideoTracks()[0];
      if (!track) return false;
      const s = track.getSettings();
      const info = { label: track.label, width: s.width, height: s.height, frameRate: s.frameRate, readyState: track.readyState };
      (window as { __previewInfo?: unknown }).__previewInfo = info;
      return true;
    },
    { timeout: 30_000 }
  ).then(() =>
    page.evaluate(() => (window as { __previewInfo?: { label: string; width: number; height: number; frameRate: number; readyState: string } }).__previewInfo)
  );
  results.realTrack = previewInfo;
  if (!previewInfo) throw new Error("no preview track");
  if (/fake|virtual/i.test(previewInfo.label)) throw new Error(`NOT a real camera: ${previewInfo.label}`);

  // Preview = the local <video> element mounts with the REAL track attached
  // (the old "Camera preview ready" stage copy was removed in review).
  await preflight.locator("video").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: `${import.meta.dirname}/evidence/realcam-1-permission-preview.png`, fullPage: true });
  results.preview = true;

  // --- Server-side participant dump while the app is in the verifying
  // window: what does RoomService see for this session's room?
  await page.waitForTimeout(12_000);
  const teacherLoginNow = await apiJson<{ accessToken: string }>("/api/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ identifier: state.teacher.email, password: state.teacher.password }),
  });
  const camStatus = await apiJson<{
    participants: Array<{ mediaIdentity: string; state: string; attemptId: number | null }>;
  }>(`/api/exam-sessions/${sessionId}/monitoring/camera-status`, teacherLoginNow.body?.accessToken ?? "");
  console.log("SERVER-CAMERA-STATUS", JSON.stringify(camStatus.body));
  results.serverCameraStatus = camStatus.body;


  try {
    await expect_visible(page, preflight, "Camera verified", 90_000);
  } catch (e) {
    await page.screenshot({ path: `${import.meta.dirname}/evidence/realcam-debug-verify-timeout.png`, fullPage: true });
    const cardText = await preflight.innerText().catch(() => "GONE");
    const roomState = await page.evaluate(() => {
      const media = (window as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } }).__quizopiaMedia;
      const room = media?.getRoom?.("preflight") ?? media?.getRoom?.("attempt");
      if (!room || typeof room !== "object") return "no-room";
      const r = room as { state?: string; localParticipant?: { trackPublications?: Map<string, unknown> } };
      const pubs: string[] = [];
      if (r.localParticipant?.trackPublications) {
        for (const pub of r.localParticipant.trackPublications.values()) {
          if (typeof pub === "object" && pub !== null) {
            const p = pub as { source?: string; track?: { muted?: boolean; kind?: string } };
            pubs.push(`${p.source ?? "?"}:${p.track?.kind ?? "?"}:muted=${p.track?.muted ?? "?"}`);
          }
        }
      }
      return { state: r.state, publications: pubs };
    });
    console.error("VERIFY-TIMEOUT-CARD:", JSON.stringify(cardText));
    console.error("VERIFY-TIMEOUT-ROOM:", JSON.stringify(roomState));
    throw e;
  }
  await page.screenshot({ path: `${import.meta.dirname}/evidence/realcam-2-verified.png`, fullPage: true });
  results.readiness = true;

  // --- Start Attempt with the lease.
  await page.getByRole("button", { name: "Start the attempt" }).click();
  await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
  const attemptId = Number(new URL(page.url()).pathname.split("/")[2]);
  results.attemptId = attemptId;
  await expect_text(page, "Camera live", 60_000);
  await page.screenshot({ path: `${import.meta.dirname}/evidence/realcam-3-attempt-live.png`, fullPage: true });

  // Attempt-side room track is the REAL device (not the fake default).
  const attemptTrack = await page.evaluate(() => {
    const media = (window as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } })
      .__quizopiaMedia;
    const room = media?.getRoom?.("attempt");
    if (typeof room !== "object" || room === null || !("localParticipant" in room)) {
      return null;
    }
    const participant = room.localParticipant as unknown;
    if (typeof participant !== "object" || participant === null || !("trackPublications" in participant)) {
      return null;
    }
    const publications = (participant as { trackPublications: Map<string, unknown> }).trackPublications;
    for (const pub of publications.values()) {
      if (typeof pub === "object" && pub !== null && "source" in pub && pub.source === "camera") {
        const track = "track" in pub ? (pub.track as unknown) : null;
        const label =
          typeof track === "object" && track !== null && "label" in track && typeof track.label === "string"
            ? track.label
            : "unknown";
        return { label };
      }
    }
    return null;
  });
  results.attemptPublishedLabel = attemptTrack;
  // Which path published: direct or canvas fallback (track name)?
  const pubInfo = await page.evaluate(() => {
    const media = (window as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } }).__quizopiaMedia;
    const room = media?.getRoom?.("attempt") ?? media?.getRoom?.("preflight");
    if (!room || typeof room !== "object") return null;
    const lp = (room as { localParticipant?: { trackPublications?: Map<string, unknown> } }).localParticipant;
    const out: Array<Record<string, unknown>> = [];
    for (const pub of lp?.trackPublications?.values() ?? []) {
      if (typeof pub === "object" && pub !== null) {
        const p = pub as { trackName?: string; trackSid?: string; kind?: string; source?: unknown };
        out.push({ name: p.trackName, sid: p.trackSid, kind: p.kind });
      }
    }
    return out;
  });
  console.log("ATTEMPT-PUBLICATIONS", JSON.stringify(pubInfo));
  results.attemptPublications = pubInfo;

  // --- Teacher Grid: real feed visible to the owner.
  const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const teacherPage = await teacherCtx.newPage();
  await teacherPage.goto("http://localhost:3000/login");
  await teacherPage.fill("#identifier", state.teacher.email);
  await teacherPage.fill("#password", state.teacher.password);
  await teacherPage.getByRole("button", { name: "Sign in" }).click();
  await teacherPage.waitForURL((u) => !u.pathname.includes("login"));
  await teacherPage.goto(`http://localhost:3000/exams/${state.examId}/sessions/${sessionId}`);

  const grid = teacherPage.getByTestId("camera-grid");
  await grid.waitFor({ state: "visible", timeout: 30_000 });
  const tile = grid.locator("[data-media-identity]");
  await tile.first().waitFor({ state: "visible", timeout: 30_000 });
  let frames: { readyState: number; videoWidth: number; videoHeight: number } = {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
  };
  for (let i = 0; i < 15; i++) {
    frames = await teacherPage.evaluate(() => {
      const el = document.querySelector("[data-media-identity] video");
      if (!(el instanceof HTMLVideoElement)) {
        return { readyState: 0, videoWidth: 0, videoHeight: 0 };
      }
      return { readyState: el.readyState, videoWidth: el.videoWidth, videoHeight: el.videoHeight };
    });
    const recvTrack = await teacherPage.evaluate(() => {
      const media = (window as { __quizopiaMedia?: { getRoom?: (s: string) => unknown } }).__quizopiaMedia;
      const room = media?.getRoom?.("teacher");
      if (!room || typeof room !== "object") return null;
      for (const p of (room as { remoteParticipants?: Map<string, { trackPublications?: Map<string, unknown> }> })
        .remoteParticipants?.values() ?? []) {
        for (const pub of p.trackPublications?.values() ?? []) {
          if (typeof pub === "object" && pub !== null) {
            const t = (pub as { track?: { dimensions?: { width?: number; height?: number } } }).track;
            if (t?.dimensions) return t.dimensions;
          }
        }
      }
      return null;
    });
    console.log("TEACHER-RECV-TRACK-DIMS", JSON.stringify(recvTrack));
    if (frames.readyState >= 2 && frames.videoWidth > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  results.teacherGrid = frames;
  if (frames.readyState < 2 || frames.videoWidth === 0) {
    throw new Error(`teacher tile has no frames: ${JSON.stringify(frames)}`);
  }
  await teacherPage.screenshot({ path: `${import.meta.dirname}/evidence/realcam-4-teacher-grid.png`, fullPage: true });

  // --- Reconnect: full page reload mid-attempt (token renewal + REAL camera
  // re-acquisition), then pill back to Camera live.
  await page.reload();
  await expect_text(page, "Camera live", 90_000);
  await page.screenshot({ path: `${import.meta.dirname}/evidence/realcam-5-reconnected.png`, fullPage: true });
  results.reconnected = true;

  const timeline = await apiJson<{ items: Array<{ eventType: string }> }>(`/api/attempts/${attemptId}/timeline?size=50`, teacher);
  results.timelineCameraEvents = (timeline.body?.items ?? []).map((i) => i.eventType).filter((t) => t.startsWith("CAMERA"));

  console.log("REAL-WEBCAM-RESULT " + JSON.stringify(results, null, 1));
  await fs.writeFile(`${import.meta.dirname}/evidence/realcam-result.json`, JSON.stringify(results, null, 2));
  await teacherCtx.close();
  await context.close();
  await browser.close();
}

async function expect_visible(page: import("@playwright/test").Page, root: import("@playwright/test").Locator, text: string, timeout: number) {
  await root.getByText(text).first().waitFor({ state: "visible", timeout });
}
async function expect_text(page: import("@playwright/test").Page, text: string, timeout: number) {
  await page.getByText(text).first().waitFor({ state: "visible", timeout });
}

main().catch((e) => {
  console.error("REAL-WEBCAM-FAILED", e);
  process.exit(1);
});
