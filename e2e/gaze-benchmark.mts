/**
 * REAL-model benchmark for BOTH AI pipelines (P4-C gaze integration gate).
 *
 *   pipeline 1: yolo26s                       → phone / screen / persons
 *   pipeline 2: yolov11n-face + MobileGaze    → gaze direction (LOOKING_AWAY)
 *
 * Bundles the PRODUCTION adapters (e2e/gaze-bench/entry.ts) with esbuild,
 * serves them with the shipped model files and onnxruntime-web assets
 * (public/models, public/ort — same paths and same non-isolated headers as
 * the Next app), and runs them in a real Chromium. No backend needed.
 *
 * Passes (each input stream is labeled):
 *   - synthetic no-face canvas, combined chain          (cost with no face)
 *   - every photo in --media <dir> (jpg/png): still photo on a jittered
 *     canvas, object-only / gaze-only / combined         (latency + FP check)
 *   - --webcam: the PHYSICAL camera, headed, guided protocol
 *     (look at screen → left → screen → right → down → screen) — the only
 *     pass that can show true positives and the real false-positive rate.
 *
 * Usage (frontend/):
 *   node e2e/gaze-benchmark.mts --media <dir-with-face-photos> [--seconds 30]
 *   node e2e/gaze-benchmark.mts --webcam            # a person must sit in front of it
 *   add --headed to watch, --webgpu to allow the WebGPU EP (default: Chromium decides)
 *
 * Output: e2e/evidence/gaze-benchmark.json (+ per-sample CSV), gitignored.
 */
import { chromium } from "playwright";
import { build } from "esbuild";
import * as http from "node:http";
import { promises as fs, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(name);
const opt = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const SECONDS = Number(opt("--seconds") ?? 30);
const MEDIA = opt("--media");
const WEBCAM = flag("--webcam");

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.round((p / 100) * (sorted.length - 1)));
  return Math.round(sorted[idx]! * 10) / 10;
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

async function main(): Promise<void> {
  if (!MEDIA && !WEBCAM) {
    console.error("nothing to run: pass --media <dir> and/or --webcam");
    process.exit(2);
  }
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "gaze-bench-"));
  await build({
    entryPoints: [path.join(import.meta.dirname, "gaze-bench", "entry.ts")],
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    outdir: out,
    tsconfig: path.join(ROOT, "tsconfig.json"),
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env.NEXT_PUBLIC_API_URL": '""',
      "process.env.NEXT_PUBLIC_AI_GAZE": '"on"',
    },
    logLevel: "warning",
  });
  writeFileSync(
    path.join(out, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>gaze bench</title>
<style>body{margin:0;background:#111;color:#fff;font:28px system-ui}#banner{position:fixed;top:0;left:0;right:0;padding:16px;text-align:center;background:#0052FF}video{width:640px;margin:90px auto 0;display:block}</style>
<div id="banner"></div><video id="video" muted playsinline></video>
<script type="module" src="/entry.js"></script>`
  );

  const server = http.createServer(async (req, res) => {
    const url = path.posix.normalize(decodeURIComponent((req.url ?? "/").split("?")[0]!));
    const inside = (base: string, p: string): string | null => {
      const resolved = path.resolve(base, "." + p);
      return resolved.startsWith(path.resolve(base) + path.sep) ? resolved : null;
    };
    let file: string | null;
    if (url === "/") file = path.join(out, "index.html");
    else if (url.startsWith("/models/") || url.startsWith("/ort/")) file = inside(path.join(ROOT, "public"), url);
    else if (url.startsWith("/media/") && MEDIA) file = path.join(MEDIA, path.basename(url));
    else file = path.join(out, path.basename(url));
    if (file == null) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;

  const browser = await chromium.launch({
    headless: !(WEBCAM || flag("--headed")),
    args: flag("--webgpu") ? ["--enable-unsafe-webgpu"] : [],
  });
  const context = await browser.newContext({ permissions: WEBCAM ? ["camera"] : [] });
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") console.error("[page]", m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => Boolean((window as unknown as { __gazeBench?: unknown }).__gazeBench));
  const env = await page.evaluate(() => ({
    ua: navigator.userAgent,
    webgpu: "gpu" in navigator,
    cores: navigator.hardwareConcurrency,
    crossOriginIsolated: self.crossOriginIsolated,
  }));

  type Pass = {
    label: string;
    source: string;
    seconds: number;
    mode: "combined" | "object-only" | "gaze-only";
    phases?: Array<{ from: number; text: string; expect: "screen" | "away" }>;
  };
  const passes: Pass[] = [];
  if (MEDIA) {
    passes.push({ label: "synthetic-no-face/combined", source: "synthetic", seconds: Math.min(SECONDS, 20), mode: "combined" });
    const photos = readdirSync(MEDIA).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
    for (const p of photos) {
      for (const mode of ["object-only", "gaze-only", "combined"] as const) {
        passes.push({ label: `photo:${p}/${mode}`, source: `image:/media/${p}`, seconds: mode === "combined" ? SECONDS * 2 : SECONDS, mode });
      }
    }
  }
  if (WEBCAM) {
    passes.push({
      label: "webcam-REAL/guided",
      source: "webcam",
      seconds: 75,
      mode: "combined",
      phases: [
        { from: 0, text: "Nhìn vào màn hình (hiệu chuẩn) — giữ tự nhiên", expect: "screen" },
        { from: 15, text: "Nhìn sang TRÁI của bạn (6s)", expect: "away" },
        { from: 21, text: "Nhìn lại màn hình", expect: "screen" },
        { from: 33, text: "Nhìn sang PHẢI của bạn (6s)", expect: "away" },
        { from: 39, text: "Nhìn lại màn hình", expect: "screen" },
        { from: 51, text: "Nhìn XUỐNG bàn (6s)", expect: "away" },
        { from: 57, text: "Nhìn lại màn hình, làm bài bình thường", expect: "screen" },
      ],
    });
  }

  const results: Array<Record<string, unknown>> = [];
  const csv: string[] = ["pass,t,objMs,gazeMs,wallMs,faces,faceWidthPx,yaw,pitch,classes,expect"];
  for (const pass of passes) {
    console.log(`▶ ${pass.label} (${pass.seconds}s)`);
    const r = (await page.evaluate((spec) => window.__gazeBench.runPass(spec), pass)) as Record<string, unknown> & {
      samples: Array<{ t: number; objMs: number | null; gazeMs: number | null; wallMs: number; faces: number | null; faceWidthPx: number | null; yaw: number | null; pitch: number | null; classes: number[]; expect: string | null }>;
      reports: Array<{ expect: string | null }>;
      elapsedS: number;
    };
    const s = r.samples;
    for (const x of s) {
      csv.push([pass.label, x.t.toFixed(2), x.objMs ?? "", x.gazeMs ?? "", x.wallMs.toFixed(1), x.faces ?? "", x.faceWidthPx ?? "", x.yaw?.toFixed(1) ?? "", x.pitch?.toFixed(1) ?? "", x.classes.join(" "), x.expect ?? ""].join(","));
    }
    const num = (a: Array<number | null>): number[] => a.filter((v): v is number => v != null);
    const yaws = num(s.map((x) => x.yaw));
    const pitches = num(s.map((x) => x.pitch));
    const std = (a: number[]): number | null => {
      if (a.length < 2) return null;
      const m = a.reduce((p, c) => p + c, 0) / a.length;
      return Math.round(Math.sqrt(a.reduce((p, c) => p + (c - m) ** 2, 0) / (a.length - 1)) * 10) / 10;
    };
    const classHist: Record<string, number> = {};
    for (const x of s) for (const c of new Set(x.classes)) classHist[c] = (classHist[c] ?? 0) + 1;
    const { samples: _drop, ...rest } = r;
    void _drop;
    results.push({
      ...rest,
      frames: s.length,
      effectiveFps: Math.round((s.length / r.elapsedS) * 10) / 10,
      objMs: { p50: pct(num(s.map((x) => x.objMs)), 50), p95: pct(num(s.map((x) => x.objMs)), 95) },
      gazeMs: { p50: pct(num(s.map((x) => x.gazeMs)), 50), p95: pct(num(s.map((x) => x.gazeMs)), 95) },
      wallMs: { p50: pct(s.map((x) => x.wallMs), 50), p95: pct(s.map((x) => x.wallMs), 95) },
      faceFramesPct: s.length ? Math.round((s.filter((x) => (x.faces ?? 0) > 0).length / s.length) * 1000) / 10 : null,
      faceWidthPxP50: pct(num(s.map((x) => x.faceWidthPx)), 50),
      yawDeg: { p50: pct(yaws, 50), std: std(yaws) },
      pitchDeg: { p50: pct(pitches, 50), std: std(pitches) },
      framesPerClass: classHist,
      lookingAwayTrackerReports: r.reports.length,
      lookingAwayReportsWhileExpectScreen: r.reports.filter((x) => x.expect === "screen").length,
    });
  }

  const report = {
    label: "REAL-MODEL BENCHMARK — yolo26s + yolov11n-face + mobileone_s0_gaze (onnxruntime-web, production adapters)",
    date: new Date().toISOString(),
    environment: env,
    notes: [
      "Every inference is the real shipped ONNX model through the production adapter code.",
      "photo:* passes draw a still photo on a jittered canvas — real model, SIMULATED camera; they measure latency and false positives on a face that looks at the camera, NOT true positives.",
      "webcam-REAL is the physical device with a person following the on-screen protocol.",
      "Loop runs flat out (no production FPS budget) to measure capacity; production adapts its FPS to the measured cost.",
    ],
    results,
  };
  const evidence = path.join(import.meta.dirname, "evidence");
  mkdirSync(evidence, { recursive: true });
  writeFileSync(path.join(evidence, "gaze-benchmark.json"), JSON.stringify(report, null, 2));
  writeFileSync(path.join(evidence, "gaze-benchmark-samples.csv"), csv.join("\n"));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
  await fs.rm(out, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
