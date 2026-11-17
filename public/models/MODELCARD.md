# Model Card — yolo26s.onnx

**Artifact:** `frontend/public/models/yolo26s.onnx`
SHA-256 `a1364960967674c8e0301222be72db49b26d01e9ad9bb08ad91f5a19e1364` (19,215,911 bytes)
Source: owner-provided (`D:\Developer\quizopia-ai-assets\yolo26s.onnx`, copied 2026-11-15).

| Field | Value |
|---|---|
| Architecture | Ultralytics YOLO26s (detect task) |
| Export | ultralytics 8.4.64, pytorch 2.12.0 → ONNX opset 17, IR 8 |
| License | **AGPL-3.0** (Ultralytics) — academic demo use; see https://ultralytics.com/license |
| Input | `images` `[1,3,640,640]` float32, RGB, /255, letterbox pad rgb(114,114,114) |
| Output | `output0` `[1,300,6]` = `[x1,y1,x2,y2,score,classId]`, end-to-end NMS built in, 640-letterbox pixel coords |
| Classes used by Quizopia | COCO: `0 person`, `62 tv`, `63 laptop`, `67 cell phone` |
| Not supported | gaze / head pose (no such output) — gaze uses the two dedicated models below |
| Reference latency | Python onnxruntime 1.32 CPU (demo workstation): p50 50.1ms / p95 56.6ms |

Browser benchmark (onnxruntime-web, measured on the demo workstation) is
recorded separately in `docs/phase4/AI_MODEL_AUDIT.md` §"Real audit results".

Detections from this model are **observations for teacher review only** — no
automatic cheating verdict, no score impact (ADR-008).

AGPL-3.0 license text: [../../LICENSE](../../LICENSE); application source offer: [../../SOURCE-AVAILABILITY.md](../../SOURCE-AVAILABILITY.md). The model's fine-tuning recipe/dataset provenance must be inventoried before claiming reproducible training; do not publish private datasets or identities.

---

# Model Card — gaze pipeline (`yolov11n-face.onnx` → `mobileone_s0_gaze.onnx`)

Added on branch `kido` (2026-11-16). Source of both artifacts: owner-provided
demo folder `D:\PTIT\2026-1\Lap-trinh-Web\Test\models\`, copied verbatim
(checksums below verified identical). The I/O facts were measured by loading
the graphs, not assumed.

## 1. Face detector — `yolov11n-face.onnx`

SHA-256 `61d8cf127ff377939cf009565457aaddf216f4d9fdd9ac24f5aab3cb10ee67b5` (10,583,411 bytes)

| Field | Value |
|---|---|
| Architecture | Ultralytics YOLO11n (detect task), 1 class `face` |
| Graph metadata | "Ultralytics YOLO11n model trained on datasets/widerface.yaml", ultralytics 8.3.20, exported 2024-10-22, pytorch 2.4.1, ONNX opset 19, IR 10 |
| License | **AGPL-3.0** (stated in the graph metadata; Ultralytics) |
| Input | `images` `[1,3,640,640]` float32, RGB, /255, letterbox pad rgb(114,114,114) |
| Output | `output0` `[1,5,8400]` — channel-major `(cx, cy, w, h, score)` in 640-letterbox pixels; **no built-in NMS** (the adapter applies greedy NMS, IoU 0.45, score ≥ 0.5) |

## 2. Gaze estimator — `mobileone_s0_gaze.onnx`

SHA-256 `8b4fdc4e3da44733c9a82e7776b411e4a39f94e8e285aee0fc85a548a55f7d9f` (4,974,521 bytes)

| Field | Value |
|---|---|
| Architecture | MobileOne-S0 backbone, two 90-bin classification heads (file name + graph; the graph carries **no metadata**) |
| Export | pytorch 2.8.0, ONNX opset 20, IR 9 |
| Input | `input` `[1,3,448,448]` float32, RGB, ImageNet mean/std, the face crop stretched to 448² |
| Output | `yaw` `[1,90]`, `pitch` `[1,90]` logits; angle = softmax expectation × 4° − 180° |
| Training data | Gaze360 according to the reference demo's source comment — **not verifiable from the artifact** |
| License / provenance | **Not recorded in the artifact — owner must confirm** the upstream repository, its license and the dataset's usage terms before any public redistribution (see `LICENSE-THIRD-PARTY.md` §3) |

The demo folder also holds `resnet18_gaze.onnx` (45 MB, same I/O). It is NOT
shipped: MobileOne-S0 is 9× smaller and ~5× faster on CPU (below).

## 3. Measured (2026-11-16, this workstation, Python onnxruntime 1.32 CPU, WSL2)

| Model | p50 | p95 |
|---|---|---|
| yolov11n-face | 81.2 ms | 88.9 ms |
| mobileone_s0_gaze | 16.6 ms | 17.5 ms |
| resnet18_gaze (not shipped) | 80.7 ms | 92.6 ms |

onnxruntime-web 1.31.1, wasm EP in Node (single photo, not a benchmark):
face 187–283 ms, gaze 55–69 ms. **No in-browser / WebGPU latency has been
measured yet.**

## 4. What it is used for — and its limits

- Output: a sustained (≥3s) or repeated (≥20% of 60s) deviation of the
  estimated gaze from the test taker's own auto-calibrated baseline becomes a
  `LOOKING_AWAY_OBSERVED` event → teacher alert `LOOKING_AWAY`.
- **Observation for teacher review only** — the most inconclusive of the AI
  signals; no automatic verdict, no score impact (ADR-008).
- **No accuracy evaluation exists**: no false-positive/negative measurement,
  no test across lighting, glasses, camera position, skin tone or device
  quality. One real-photo smoke run confirmed the pipeline end to end (face
  box within ~1px of a Python reference), and showed the angle on a ~90px
  face moving by ~10° with the image resampling method alone — small faces
  (< 80px) are therefore ignored.
- Direction labels (left/right) follow the reference demo's sign convention
  transferred to the unmirrored frame; this was **not** validated against
  ground truth.
