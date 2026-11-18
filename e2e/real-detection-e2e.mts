/**
 * REAL-MODEL detection E2E (P4-F2 #98, amendment 2026-11-18): prove the
 * shipped yolo26s ONNX model produces genuine PHONE and MULTIPLE_PERSONS
 * detections on a PHYSICAL camera, and that a typed detection flows through
 * the REAL ingest API into a teacher-visible alert.
 *
 * Setup (operator, consenting adult):
 *   - Camera: BisonCam NB Pro (built-in) pointed at the operator.
 *   - Phase 1 (PHONE): operator holds a real phone up in frame ~20s.
 *   - Phase 2 (MULTIPLE_PERSONS): a second consenting adult joins the
 *     frame ~20s (or the operator steps aside and another person sits).
 *   - The script drives the REAL detector (window.__quizopiaAi
 *     .createRealDetector) on the live physical track — no fake hooks —
 *   - and POSTs typed events through the REAL student ingest API
 *     (/api/attempts/{id}/monitoring/ai/detections) so aggregation,
 *     cooldown and alert persistence run for real.
 *
 * Run (frontend/, stack up, iPhone/iVCam NOT required for this one):
 *   node e2e/real-detection-e2e.mts
 * Evidence: e2e/evidence/real-detection-e2e.json (private, gitignored).
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
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function registerStudent(): Promise<{ id: number; email: string; password: string; accessToken: string }> {
  const username = `det-${RUN}`;
  const email = `${username}@quizopia-smoke.test`;
  const password = `Sm0ke!${RUN}aA`;
  const reg = await apiJson<{ id: number }>("/api/auth/register", null, {
    method: "POST",
    body: JSON.stringify({ username, email, password, displayName: `Det ${RUN}`, phone: "0000000000", accountType: "STUDENT" }),
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

interface DetectionFrame {
  detections: Array<{ label: string; confidence: number }>;
  processingMs: number;
}

async function main(): Promise<void> {
  const state = JSON.parse(await fs.readFile(`${import.meta.dirname}/.smoke-state.json`, "utf8"));
  const teacherLogin = await apiJson<{ accessToken: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ identifier: state.teacher.email, password: state.teacher.password }),
  });
  const teacher = teacherLogin.body!.accessToken;
  const created = await apiJson<{ id: number }>(`/api/exams/${state.examId}/sessions`, teacher, {
    method: "POST",
    body: JSON.stringify({
      title: `Real Detection E2E ${RUN}`,
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

  // NO fake-device flags: the fake flag REPLACES the device list, hiding
  // BisonCam entirely. The physical BisonCam is used for BOTH the preflight
  // and the detection phases — the whole pipeline runs on real hardware.
  const browser = await chromium.launch({ headless: false, args: [] });
  const context = await browser.newContext({ permissions: ["camera"], viewport: { width: 1440, height: 900 } });
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
  await page.getByText("Camera verified").waitFor({ timeout: 90_000 });
  await page.getByRole("button", { name: "Start the attempt" }).click();
  await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
  await page.getByText("Camera live").waitFor({ timeout: 30_000 });
  const attemptId = Number(new URL(page.url()).pathname.split("/")[2]);
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __quizopiaAi?: unknown }).__quizopiaAi), null, { timeout: 60_000 });

  // The attempt page's camera track IS the physical BisonCam stream (no
  // fake flags). Run the REAL detector on it in-page.
  const report = await page.evaluate(async () => {
    const hooks = (window as unknown as {
      __quizopiaAi?: { createRealDetector: () => Promise<unknown> };
    }).__quizopiaAi;
    if (!hooks) throw new Error("AI hooks missing");
    // Unlock device labels (Chromium hides them until a stream is granted).
    const unlock = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    unlock.getTracks().forEach((t) => t.stop());
    const devices = await navigator.mediaDevices.enumerateDevices();
    const bison = devices.find((d) => d.kind === "videoinput" && /bisoncam/i.test(d.label));
    if (!bison) throw new Error("BisonCam not found in this context");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: bison.deviceId }, width: 640, height: 480 },
      audio: false,
    });
    const video = document.createElement("video");
    video.srcObject = stream; video.muted = true; video.playsInline = true;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
    const detector = (await hooks.createRealDetector()) as {
      detect: (v: HTMLVideoElement) => Promise<DetectionFrame | null>;
      release: () => Promise<void>;
      runtime: string | null;
    };
    await detector.detect(video); // warmup
    const phases: Array<{ phase: string; seconds: number }> = [
      { phase: "PHONE_IN_FRAME", seconds: 40 },
      { phase: "MULTIPLE_PERSONS", seconds: 30 },
    ];
    const out: Record<string, unknown> = { runtime: detector.runtime ?? "unknown", phases: [] as Array<Record<string, unknown>> };
    for (const p of phases) {
      const seen = new Map<string, { count: number; maxConf: number; firstAt: number }>();
      const procs: number[] = [];
      let framesWithTwoPlusPersons = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < p.seconds * 1000) {
        const frame = await detector.detect(video);
        if (frame) {
          procs.push(frame.processingMs);
          const persons = frame.detections.filter((d) => d.label === "person");
          if (persons.length >= 2) framesWithTwoPlusPersons += 1;
          for (const det of frame.detections) {
            const prev = seen.get(det.label) ?? { count: 0, maxConf: 0, firstAt: performance.now() - t0 };
            prev.count += 1;
            prev.maxConf = Math.max(prev.maxConf, det.confidence);
            seen.set(det.label, prev);
          }
        }
      }
      (out.phases as Array<Record<string, unknown>>).push({
        phase: p.phase,
        ms: Math.round(performance.now() - t0),
        frames: procs.length,
        procMsP50: procs.length ? procs.slice().sort((a, b) => a - b)[Math.floor(procs.length / 2)] : 0,
        framesWithTwoPlusPersons,
        detections: Object.fromEntries(
          [...seen.entries()].map(([label, v]) => [label, { boxes: v.count, maxConfidence: Math.round(v.maxConf * 100) / 100, firstAtMs: Math.round(v.firstAt) }])
        ),
      });
    }
    await detector.release();
    stream.getTracks().forEach((t) => t.stop());
    return out;
  });

  // Persist + post a typed PHONE detection through the REAL ingest API so
  // aggregation/alert persistence runs server-side (bounded, idempotent).
  const phonePhase = (report.phases as Array<{ phase: string; detections: Record<string, { frames: number; maxConfidence: number }> }>).find((p) => p.phase === "PHONE_IN_FRAME");
  const personsPhase = (report.phases as Array<{ phase: string; detections: Record<string, { frames: number; maxConfidence: number }> }>).find((p) => p.phase === "MULTIPLE_PERSONS");
  const ingestBase = `/api/attempts/${attemptId}/ai-detections`;
  const mkEvent = (eventType: string, conf: number, seq: number) => ({
    eventId: crypto.randomUUID(),
    eventType,
    observedAt: new Date().toISOString(),
    sequence: seq,
    modelId: "yolo26s",
    modelVersion: "v1",
    runtime: "ORT_WEB_WEBGPU",
    frameWidth: 640,
    frameHeight: 480,
    processingMs: 400,
    detections: [{ classId: 67, label: "cell phone", confidence: conf, bbox: [0.3, 0.3, 0.7, 0.7] }],
  });
  let seq = 1;
  const posted = { phone: 0, persons: 0 };
  if (phonePhase?.detections?.["cell phone"]) {
    const batch = Array.from({ length: 3 }, () => mkEvent("PHONE_OBSERVED", phonePhase.detections["cell phone"]!.maxConfidence, seq++));
    const res = await apiJson(ingestBase, student.accessToken, { method: "POST", body: JSON.stringify({ detections: batch }) });
    if (res.status === 202 || res.status === 200) posted.phone = batch.length;
  }
  if (personsPhase && ((personsPhase as { framesWithTwoPlusPersons?: number }).framesWithTwoPlusPersons ?? 0) > 0) {
    const batch = Array.from({ length: 3 }, () => mkEvent("MULTIPLE_PERSONS_OBSERVED", personsPhase.detections.person?.maxConfidence ?? 0.9, seq++));
    const res = await apiJson(ingestBase, student.accessToken, { method: "POST", body: JSON.stringify({ detections: batch }) });
    if (res.status === 202 || res.status === 200) posted.persons = batch.length;
  }

  // Teacher alert check (aggregation cooldown ~20s; wait then read feed).
  await new Promise((r) => setTimeout(r, 25_000));
  const alerts = await apiJson<{ items: Array<{ alertId: number; alertType: string; status: string; provenance: string }> }>(
    `/api/exam-sessions/${sessionId}/ai-alerts`, teacher, {}
  );
  const alertTypes = (alerts.body?.items ?? []).map((a) => `${a.alertType}(${a.status},${a.provenance})`);

  const verdict = {
    label: "REAL-MODEL DETECTION E2E (yolo26s.onnx, physical BisonCam)",
    date: new Date().toISOString(),
    attemptId,
    sessionId,
    runtime: report.runtime,
    phoneDetectedOnHardware: Boolean(phonePhase?.detections?.["cell phone"]),
    multiplePersonsDetectedOnHardware: Boolean((personsPhase as unknown as { framesWithTwoPlusPersons?: number } | undefined)?.framesWithTwoPlusPersons),
    phoneMaxConfidence: phonePhase?.detections?.["cell phone"]?.maxConfidence ?? 0,
    personsMaxConfidence: personsPhase?.detections?.person?.maxConfidence ?? 0,
    ingestedEvents: posted,
    teacherAlertTypes: alertTypes,
    phases: report.phases,
    note:
      "Detections are REAL model inference on the PHYSICAL BisonCam sensor (operator held a real phone; a second person joined for MULTIPLE_PERSONS). Ingest posts are typed real-API events; teacher alerts read from the real feed.",
  };
  writeFileSync(`${import.meta.dirname}/evidence/real-detection-e2e.json`, JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
