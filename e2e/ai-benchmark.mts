/**
 * REAL-model browser benchmark (P4-C, issues #79/#89).
 *
 * Runs the REAL yolo26s.onnx via the real adapter (onnxruntime-web) inside
 * a real Chromium page against the dev server:
 *   - synthetic canvas stream (drawn shapes; no camera) — default
 *   - --webcam: the REAL physical camera (headed only)
 * Measures per-frame processingMs (preprocess+inference+postprocess from
 * the adapter), wall-clock detect() latency, effective analysis FPS, the
 * runtime actually used (webgpu/wasm), and detection outcomes on labeled
 * synthetic content. Output: JSON printed + e2e/evidence/ai-benchmark.json.
 *
 * Everything here is REAL-model output — no fake detector involved. The
 * synthetic STREAM is a source, not a fake model (labeled in the report).
 *
 * Usage (frontend/):
 *   node e2e/ai-benchmark.mts            # synthetic stream, tries WebGPU→WASM
 *   node e2e/ai-benchmark.mts --webcam   # + real webcam pass (headed)
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

interface FrameSample {
  processingMs: number;
  frameWidth: number;
  frameHeight: number;
  runtime: string;
  simulated: boolean;
  at: number;
  detectionCount: number;
}

interface PassResult {
  pass: string;
  frames: number;
  wallMsP50: number;
  wallMsP95: number;
  procMsP50: number;
  procMsP95: number;
  effectiveFps: number;
  runtime: string;
  detectionsTotal: number;
  framesWithDetections: number;
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)));
  return Math.round(sorted[idx]! * 10) / 10;
}

async function runPass(
  page: import("playwright").Page,
  label: string,
  source: "synthetic" | "webcam",
  seconds: number
): Promise<PassResult> {
  const setup = await page.evaluate(
    async ({ src, dur }) => {
      const w = src === "webcam" ? 640 : 1280;
      const h = src === "webcam" ? 480 : 720;
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      if (src === "webcam") {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: w, height: h },
        });
        video.srcObject = stream;
      } else {
        // Synthetic animated stream: colored "phone-like" rectangle moving.
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
        video.srcObject = (canvas as HTMLCanvasElement).captureStream(30);
      }
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2 && video.videoWidth > 0) resolve();
        else video.addEventListener("loadeddata", () => resolve(), { once: true });
      });
      const hooks = (window as unknown as {
        __quizopiaAi?: { createRealDetector: () => Promise<unknown> };
      }).__quizopiaAi;
      if (!hooks) throw new Error("AI test hooks not exposed on this page");
      const detector = (await hooks.createRealDetector()) as {
        detect: (
          v: HTMLVideoElement
        ) => Promise<{ detections: unknown[]; processingMs: number } | null>;
        release: () => Promise<void>;
        runtime: string | null;
      };
      // Warmup (session + first inference), then timed loop.
      await detector.detect(video);
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
      return {
        walls,
        procs,
        detectionsTotal,
        framesWithDetections,
        elapsedS,
        runtime: detector.runtime ?? "unknown",
        width: video.videoWidth,
        height: video.videoHeight,
      };
    },
    { src: source, dur: seconds }
  );
  const walls = [...setup.walls].sort((a, b) => a - b);
  const procs = [...setup.procs].sort((a, b) => a - b);
  return {
    pass: label,
    frames: walls.length,
    wallMsP50: pct(walls, 50),
    wallMsP95: pct(walls, 95),
    procMsP50: pct(procs, 50),
    procMsP95: pct(procs, 95),
    effectiveFps: Math.round((walls.length / setup.elapsedS) * 10) / 10,
    runtime: setup.runtime,
    detectionsTotal: setup.detectionsTotal,
    framesWithDetections: setup.framesWithDetections,
  };
}

async function main(): Promise<void> {
  const wantWebcam = process.argv.includes("--webcam");
  const base = process.env.SMOKE_API_BASE?.replace(":8080", ":3000") ?? "http://localhost:3000";
  const browser = await chromium.launch({ headless: false }); // headed: real GPU + real devices
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    Boolean((window as unknown as { __quizopiaAi?: unknown }).__quizopiaAi)
  , null, { timeout: 60_000 });

  const results: PassResult[] = [];
  const ua = await page.evaluate(() => ({
    ua: navigator.userAgent,
    gpu: (navigator as unknown as { gpu?: { requestAdapter?: () => unknown } }).gpu
      ? "webgpu-available"
      : "no-webgpu",
    cores: navigator.hardwareConcurrency,
  }));

  // WASM pass: disable WebGPU via CDP? Simpler: report the adapter's chosen
  // runtime; a separate --disable-gpu run covers WASM-only.
  results.push(await runPass(page, "synthetic-30s", "synthetic", 30));
  if (wantWebcam) {
    await page.waitForTimeout(1000);
    results.push(await runPass(page, "webcam-20s-REAL", "webcam", 20));
  }

  const report = {
    label: "REAL MODEL BENCHMARK (yolo26s.onnx, onnxruntime-web)",
    date: new Date().toISOString(),
    environment: ua,
    note:
      "Synthetic pass uses a drawn canvas stream (source, not a fake model); " +
      "webcam pass is a real physical device. All inference is the real model.",
    results,
  };
  writeFileSync(`${__dirname}/evidence/ai-benchmark.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

void main();
