# Third-Party Notices — Quizopia Frontend

This project redistributes or relies on the following third-party components.
Each entry states what is shipped and under which license.

## 1. Ultralytics YOLO26s model weights (AGPL-3.0)

- **Artifact:** `public/models/yolo26s.onnx`
  (19,215,911 bytes, SHA-256 `a1364960967674c8e0301222be72db49b26d01e9ad9bb08ad91f5a19e1364`)
- **Origin:** owner-provided artifact, fine-tuned by the Quizopia Product Owner from the publicly released
  Ultralytics pretrained `yolo26s.pt` checkpoint; exported to ONNX (opset 17).
- **License:** **GNU Affero General Public License v3.0 (AGPL-3.0)** —
  Ultralytics treats weights trained with their software, including ONNX
  exports, as derivative works of their AGPL-3.0-licensed code
  (https://ultralytics.com/license).
- **License text:** the repository root [LICENSE](LICENSE) (complete AGPL-3.0 text), also
  available at https://www.gnu.org/licenses/agpl-3.0.txt.
- **Upstream source:** https://github.com/ultralytics/ultralytics (AGPL-3.0).
- **Compliance review & pending owner decisions:**
  `docs/phase4/LICENSE_COMPLIANCE.md` (Quizopia_System repo).

## 2. onnxruntime-web (MIT)

Also runs the two gaze-pipeline models of §3.

- **Package:** `onnxruntime-web` 1.31.1 (npm); vendored runtime artifacts under
  `public/ort/` (`ort-wasm-simd-threaded.jsep.mjs`, `.wasm`).
- **License:** MIT — https://github.com/microsoft/onnxruntime/blob/main/LICENSE
  Copyright (c) Microsoft Corporation.

## 3. Gaze pipeline model weights (branch `kido`)

- **`public/models/yolov11n-face.onnx`** (10,583,411 bytes, SHA-256
  `61d8cf127ff377939cf009565457aaddf216f4d9fdd9ac24f5aab3cb10ee67b5`) —
  Ultralytics YOLO11n face detector. The ONNX metadata states
  `AGPL-3.0 License (https://ultralytics.com/license)`, ultralytics 8.3.20,
  trained on `widerface.yaml`. Same license as this repository
  ([LICENSE](LICENSE)); upstream source
  https://github.com/ultralytics/ultralytics. **Open item:** who trained and
  published this particular checkpoint, and the WIDER FACE dataset terms.
- **`public/models/mobileone_s0_gaze.onnx`** (4,974,521 bytes, SHA-256
  `8b4fdc4e3da44733c9a82e7776b411e4a39f94e8e285aee0fc85a548a55f7d9f`) —
  MobileOne-S0 gaze estimator (yaw/pitch, 90 bins). **The artifact carries no
  license or provenance metadata.** The owner-supplied demo describes it as
  trained on Gaze360. **Open item (owner):** record the upstream repository
  and its license, and check the Gaze360 dataset's usage terms, before this
  file is pushed to a public repository or deployed.

## 4. Other dependencies

All remaining npm dependencies declare their licenses in
`package.json` / `package-lock.json` and are used unmodified via the npm
registry (no source redistribution).

## Quizopia source availability

All three Quizopia repositories are published under AGPL-3.0; see [SOURCE-AVAILABILITY.md](SOURCE-AVAILABILITY.md). The project owner fine-tuned the model from Ultralytics pretrained weights. Exact custom training scripts/configuration and dataset release rights still need a separate owner-side inventory; never publish private training data or student footage by default.
