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
| Not supported | gaze / head pose (no such output) — gaze adapter stays disabled |
| Reference latency | Python onnxruntime 1.32 CPU (demo workstation): p50 50.1ms / p95 56.6ms |

Browser benchmark (onnxruntime-web, measured on the demo workstation) is
recorded separately in `docs/phase4/AI_MODEL_AUDIT.md` §"Real audit results".

Detections from this model are **observations for teacher review only** — no
automatic cheating verdict, no score impact (ADR-008).
