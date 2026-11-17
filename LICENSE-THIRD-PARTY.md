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

## 3. Gaze pipeline model weights (P4-C gaze, experimental)

Provenance verified 2026-11-17 by byte-identical SHA-256 against the
upstream GitHub release assets (not by file name).

- **`public/models/yolov11n-face.onnx`** (10,583,411 bytes, SHA-256
  `61d8cf127ff377939cf009565457aaddf216f4d9fdd9ac24f5aab3cb10ee67b5`)
  - **Upstream:** release `1.0.0` of https://github.com/akanametov/yolo-face
    (asset `yolov11n-face.onnx`,
    https://github.com/akanametov/yolo-face/releases/download/1.0.0/yolov11n-face.onnx) —
    downloaded file hash identical.
  - **License:** repository license **GPL-3.0**
    (https://github.com/akanametov/yolo-face/blob/dev/LICENSE); the ONNX
    metadata states Ultralytics **AGPL-3.0** (Ultralytics 8.3.20, YOLO11n).
    GPL-3.0 §13 permits combining with AGPL-3.0 work; this repository is
    AGPL-3.0 ([LICENSE](LICENSE)), so redistribution under AGPL-3.0 with this
    notice is consistent with both.
  - **Training data:** WIDER FACE (`widerface.yaml` in the graph metadata).
    The dataset is distributed for **non-commercial research** (dataset card:
    CC BY-NC-ND 4.0). Whether dataset terms bind trained weights is not
    settled law — see the owner decision below.
- **`public/models/mobileone_s0_gaze.onnx`** (4,974,521 bytes, SHA-256
  `8b4fdc4e3da44733c9a82e7776b411e4a39f94e8e285aee0fc85a548a55f7d9f`)
  - **Upstream:** "MobileGaze" by Yakhyokhuja Valikhujaev, release `weights`
    of https://github.com/yakhyo/gaze-estimation (asset
    `mobileone_s0_gaze.onnx`; GitHub-published digest
    `sha256:8b4fdc4e…5f7d9f` identical). Citation: Valikhujaev, Y. (2024),
    *MobileGaze: Pre-trained mobile nets for Gaze-Estimation*,
    https://doi.org/10.5281/zenodo.14257640.
  - **License:** **MIT**, Copyright (c) 2024 Yakhyokhuja Valikhujaev
    (https://github.com/yakhyo/gaze-estimation/blob/main/LICENSE). MIT permits
    redistribution with this copyright + permission notice, which this entry
    carries.
  - **Training data:** Gaze360 (MIT CSAIL), released for **non-commercial
    research use only** (paper record: CC BY-NC-SA; https://gaze360.csail.mit.edu).
- **Owner decision (open):** code/weight licenses above allow redistribution
  in this AGPL-3.0, non-commercial academic project. Both training datasets
  are non-commercial research datasets, so any **commercial** deployment of
  the gaze feature needs the owner's legal sign-off or replacement weights.
  The gaze feature can be shipped without these files: build with
  `NEXT_PUBLIC_AI_GAZE=off` (object detection is unaffected).

## 4. Other dependencies

All remaining npm dependencies declare their licenses in
`package.json` / `package-lock.json` and are used unmodified via the npm
registry (no source redistribution).

## Quizopia source availability

All three Quizopia repositories are published under AGPL-3.0; see [SOURCE-AVAILABILITY.md](SOURCE-AVAILABILITY.md). The project owner fine-tuned the model from Ultralytics pretrained weights. Exact custom training scripts/configuration and dataset release rights still need a separate owner-side inventory; never publish private training data or student footage by default.
