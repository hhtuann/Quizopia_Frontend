/**
 * REAL-model browser benchmark (P4-C, issues #79/#89).
 *
 * Boots a REAL monitored attempt (API bootstrap + UI preflight flow with
 * synthetic Chromium camera — the attempt page is where the AI test hooks
 * live), then drives the REAL yolo26s adapter through
 * window.__quizopiaAi.createRealDetector() against:
 *   1. a synthetic animated canvas stream (30s)
 *   2. --webcam: the REAL physical camera (20s, headed)
 *
 * The page's own AI hook is idled with a null FAKE (init script) so exactly
 * ONE real session runs — the benchmark's. All numbers are REAL-model
 * inference; the stream source is labeled per pass.
 *
 * Usage (frontend/, requires the smoke stack + Scenario A seed):
 *   node e2e/ai-benchmark.mts            # synthetic pass
 *   node e2e/ai-benchmark.mts --webcam   # + real webcam pass (headed)
 */
import { chromium } from "playwright";
import { promises as fs } from "node:fs";
import { writeFileSync } from "node:fs";
import * as http from "node:http";

const API = process.env.SMOKE_API_BASE ?? "http://localhost:8080";
const APP = process.env.SMOKE_APP_BASE ?? "http://localhost:3000";
const MAILPIT = process.env.SMOKE_MAILPIT_BASE ?? "http://localhost:8025";
const RUN = Date.now().toString(36);

function apiJson<T>(path: string, token: string | null, init: { method?: string; body?: string } = {}): Promise<{ status: number; body: T | null; raw: string }> {
  return new Promise((resolve, reject) => {
    const data = init.body ?? "";
    const req = http.request(
      `${API}${path}`,
      {
        method: init.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: d ? JSON.parse(d) : null, raw: d.slice(0, 400) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: null, raw: d.slice(0, 400) });
          }
        });
      }
    );
    req.setTimeout(30_000, () => req.destroy(new Error("apiJson timeout")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function registerStudent(): Promise<{ id: number; email: string; password: string; accessToken: string }> {
  const username = `bench-${RUN}`;
  const email = `${username}@quizopia-smoke.test`;
  const password = `Sm0ke!${RUN}aA`;
  const reg = await apiJson<{ id: number }>("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ username, email, password, displayName: `Bench ${RUN}`, phone: "0000000000", accountType: "STUDENT" }),
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${reg.raw}`);
  let otp = "";
  for (let i = 0; i < 20 && !otp; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const list = (await fetch(`${MAILPIT}/api/v1/messages?limit=10`).then((r) => r.json())) as {
      messages?: Array<{ ID: string; To: Array<{ Address: string }> | string }>;
    };
    for (const m of list.messages ?? []) {
      const to = Array.isArray(m.To) ? m.To.map((t) => t.Address).join(",") : String(m.To ?? "");
      if (to.includes(email)) {
        const msg = (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json())) as { Text?: string; HTML?: string };
        const match = String(msg.Text ?? msg.HTML ?? "").match(/\b(\d{6})\b/);
        if (match) otp = match[1];
      }
    }
  }
  if (!otp) throw new Error("no OTP (Mailpit)");
  await apiJson("/api/auth/verify-email", null, { method: "POST", body: JSON.stringify({ email, otp }) });
  const login = await apiJson<{ accessToken: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ identifier: email, password }),
  });
  if (login.status !== 200) throw new Error(`login failed: ${login.status}`);
  return { id: reg.body!.id, email, password, accessToken: login.body!.accessToken };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)));
  return Math.round(sorted[idx]! * 10) / 10;
}

async function main(): Promise<void> {
  const wantWebcam = process.argv.includes("--webcam");
  const state = JSON.parse(await fs.readFile(`${import.meta.dirname}/.smoke-state.json`, "utf8"));
  const teacherLogin = await apiJson<{ accessToken: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ identifier: state.teacher.email, password: state.teacher.password }),
  });
  const teacher = teacherLogin.body!.accessToken;
  const created = await apiJson<{ id: number }>(`/api/exams/${state.examId}/sessions`, teacher, {
    method: "POST",
    body: JSON.stringify({
      title: `AI Bench Session ${RUN}`,
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 55 * 60_000).toISOString(),
      maxAttempts: 1,
      visibility: "CLASS_RESTRICTED",
      classroomIds: [state.classroomId],
      monitoring: { monitoringEnabled: true, activityTrackingEnabled: true },
    }),
  });
  if (created.status >= 300) throw new Error(`session create: ${created.status}`);
  const sessionId = created.body!.id;
  await apiJson(`/api/exams/${state.examId}/sessions/${sessionId}/schedule`, teacher, { method: "POST" });
  await apiJson(`/api/exams/${state.examId}/sessions/${sessionId}/open`, teacher, { method: "POST" });
  const student = await registerStudent();
  await apiJson(`/api/classrooms/${state.classroomId}/members`, teacher, {
    method: "POST",
    body: JSON.stringify({ userIds: [student.id] }),
  });

  // Headed REAL-model browser. Synthetic camera (fake-device flags) for the
  // attempt flow itself; the benchmark passes attach their own streams.
  const browser = await chromium.launch({
    headless: false,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
  // Idle the page's own AI hook with a null FAKE so only the benchmark's
  // session loads the model (SIMULATED-null: no events, no inference).
  await context.addInitScript(() => {
    const install = (): void => {
      const hooks = (window as unknown as { __quizopiaAi?: { setFakeDetector: (fn: unknown) => void } }).__quizopiaAi;
      if (hooks?.setFakeDetector) hooks.setFakeDetector(() => null);
      else setTimeout(install, 150);
    };
    install();
  });
  const page = await context.newPage();
  await page.goto(`${APP}/login`);
  await page.fill("#identifier", student.email);
  await page.fill("#password", student.password);
  await page.click("button[type=submit]");
  await page.waitForTimeout(4_000);
  await page.goto(`${APP}/sessions/${sessionId}`);
  const preflight = page.getByTestId("camera-preflight");
  await preflight.waitFor({ state: "visible", timeout: 30_000 });
  await preflight.getByRole("button", { name: "Enable camera" }).click();
  try {
    await page.getByText("Camera verified").waitFor({ timeout: 90_000 });
  } catch {
    // The synthetic raw track sometimes needs a second preflight round
    // (canvas-fallback engagement) — use the UI's own retry affordance.
    const retry = page.getByRole("button", { name: "Retry camera check" });
    if (await retry.count()) {
      await retry.first().click();
      await page.getByText("Camera verified").waitFor({ timeout: 90_000 });
    } else {
      await page.screenshot({ path: `${import.meta.dirname}/evidence/ai-bench-preflight-FAIL.png`, fullPage: true });
      throw new Error("preflight verify timed out with no retry affordance");
    }
  }
  await page.getByRole("button", { name: "Start the attempt" }).click();
  await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
  await page.getByText("Camera live").waitFor({ timeout: 30_000 });
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __quizopiaAi?: unknown }).__quizopiaAi)
  , null, { timeout: 60_000 });

  const results: Array<Record<string, unknown>> = [];
  const env = await page.evaluate(() => ({
    ua: navigator.userAgent,
    gpu: "gpu" in navigator ? "webgpu-available" : "no-webgpu",
    cores: navigator.hardwareConcurrency,
  }));

  for (const pass of [
    { label: "synthetic-canvas-30s", source: "synthetic", seconds: 30 },
    ...(wantWebcam ? [{ label: "webcam-20s-REAL", source: "webcam", seconds: 20 }] : []),
  ]) {
    const r = await page.evaluate(
      async ({ src, dur }) => {
        const w = 1280;
        const h = 720;
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        if (src === "webcam") {
          video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          let t = 0;
          const draw = (): void => {
            ctx.fillStyle = "#202020";
            ctx.fillRect(0, 0, w, h);
            const x = (Math.sin(t) * 0.5 + 0.5) * (w - 200);
            ctx.fillStyle = "#c0c0c8";
            ctx.fillRect(x, h / 2 - 120, 200, 240);
            ctx.fillStyle = "#404048";
            ctx.fillRect(x + 20, h / 2 - 100, 160, 200);
            t += 0.05;
            requestAnimationFrame(draw);
          };
          draw();
          video.srcObject = canvas.captureStream(30);
        }
        await video.play();
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2 && video.videoWidth > 0) resolve();
          else video.addEventListener("loadeddata", () => resolve(), { once: true });
        });
        const hooks = (window as unknown as {
          __quizopiaAi?: { createRealDetector: () => Promise<unknown> };
        }).__quizopiaAi;
        if (!hooks) throw new Error("AI hooks missing");
        const detector = (await hooks.createRealDetector()) as {
          detect: (v: HTMLVideoElement) => Promise<{ detections: unknown[]; processingMs: number } | null>;
          release: () => Promise<void>;
          runtime: string | null;
        };
        await detector.detect(video); // warmup
        const walls: number[] = [];
        const procs: number[] = [];
        let detectionsTotal = 0;
        let framesWithDetections = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < dur * 1000) {
          const s = performance.now();
          const frame = await detector.detect(video);
          walls.push(performance.now() - s);
          if (frame) {
            procs.push(frame.processingMs);
            const n = frame.detections.length;
            detectionsTotal += n;
            if (n > 0) framesWithDetections += 1;
          }
        }
        const elapsedS = (performance.now() - t0) / 1000;
        await detector.release();
        (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
        video.srcObject = null;
        return { walls, procs, detectionsTotal, framesWithDetections, elapsedS, runtime: detector.runtime ?? "unknown" };
      },
      { src: pass.source, dur: pass.seconds }
    );
    const walls = [...r.walls].sort((a, b) => a - b);
    const procs = [...r.procs].sort((a, b) => a - b);
    results.push({
      pass: pass.label,
      frames: walls.length,
      wallMsP50: pct(walls, 50),
      wallMsP95: pct(walls, 95),
      procMsP50: pct(procs, 50),
      procMsP95: pct(procs, 95),
      effectiveFps: Math.round((walls.length / r.elapsedS) * 10) / 10,
      runtime: r.runtime,
      detectionsTotal: r.detectionsTotal,
      framesWithDetections: r.framesWithDetections,
    });
  }

  const report = {
    label: "REAL MODEL BENCHMARK (yolo26s.onnx, onnxruntime-web)",
    date: new Date().toISOString(),
    environment: env,
    note:
      "Synthetic pass analyzes a drawn canvas stream (stream source, not a fake model); " +
      "webcam pass is the physical device. Every inference is the REAL model.",
    results,
  };
  writeFileSync(`${import.meta.dirname}/evidence/ai-benchmark.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${import.meta.dirname}/evidence/ai-benchmark-attempt.png`, fullPage: false });
  await browser.close();
}

void main();
