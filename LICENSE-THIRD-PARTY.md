# Third-Party Notices — Quizopia Frontend

This project redistributes or relies on the following third-party components.
Each entry states what is shipped and under which license.

## 1. Ultralytics YOLO26s model weights (AGPL-3.0)

- **Artifact:** `public/models/yolo26s.onnx`
  (19,215,911 bytes, SHA-256 `a1364960967674c8e0301222be72db49b26d01e9ad9bb08ad91f5a19e1364`)
- **Origin:** owner-provided artifact, produced by Ultralytics YOLO26s
  (ultralytics 8.4.64) trained on COCO; exported to ONNX (opset 17).
- **License:** **GNU Affero General Public License v3.0 (AGPL-3.0)** —
  Ultralytics treats weights trained with their software, including ONNX
  exports, as derivative works of their AGPL-3.0-licensed code
  (https://ultralytics.com/license).
- **License text:** https://www.gnu.org/licenses/agpl-3.0.txt (AGPL-3.0).
  A copy should accompany any distribution of this artifact.
- **Upstream source:** https://github.com/ultralytics/ultralytics (AGPL-3.0).
- **Compliance review & pending owner decisions:**
  `docs/phase4/LICENSE_COMPLIANCE.md` (Quizopia_System repo).

## 2. onnxruntime-web (MIT)

- **Package:** `onnxruntime-web` 1.31.1 (npm); vendored runtime artifacts under
  `public/ort/` (`ort-wasm-simd-threaded.jsep.mjs`, `.wasm`).
- **License:** MIT — https://github.com/microsoft/onnxruntime/blob/main/LICENSE
  Copyright (c) Microsoft Corporation.

## 3. Other dependencies

All remaining npm dependencies declare their licenses in
`package.json` / `package-lock.json` and are used unmodified via the npm
registry (no source redistribution).
