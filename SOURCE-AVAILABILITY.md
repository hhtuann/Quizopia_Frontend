# Quizopia Frontend — Source Availability & AGPL-3.0

SPDX-License-Identifier: AGPL-3.0-only

The Quizopia Frontend application, including browser-side AI proctoring integration, is licensed under the **GNU Affero General Public License version 3.0**. Full text: [LICENSE](LICENSE). The [Quizopia Backend](https://github.com/hhtuann/Quizopia_Backend) and [Quizopia System](https://github.com/hhtuann/Quizopia_System) are also licensed AGPL-3.0.

## Complete corresponding application source

- Frontend: https://github.com/hhtuann/Quizopia_Frontend
- Backend: https://github.com/hhtuann/Quizopia_Backend
- System / Docker / orchestration: https://github.com/hhtuann/Quizopia_System

Use the **exact release tag or commit SHA** corresponding to the version being served to users. Production deployments are **not authorized** by this change.

## AI model and third-party source

- Binary: `public/models/yolo26s.onnx`; integrity and graph interface are documented in `public/models/MODELCARD.md`.
- **Model provenance (owner-confirmed, 2026-11-15):** the owner fine-tuned publicly available Ultralytics pretrained `yolo26s.pt` weights and exported ONNX. This was not random-weights training.
- Original checkpoint and implementation source: https://github.com/ultralytics/ultralytics ; license: AGPL-3.0 (full text above).
- Third-party runtime and model notices: [LICENSE-THIRD-PARTY.md](LICENSE-THIRD-PARTY.md).

**Training-source inventory is still required** for a reproducibility/compliance claim: the owner should supply the exact fine-tuning script/commands, model checkpoint provenance, augmentation and hyperparameters, configuration (excluding passwords/tokens) and legally shareable dataset metadata or instructions. Do not expose private datasets, personal data or consented student media without authorization. The weights file and the application inference code are already public, but that alone does not certify all source obligations are fulfilled.

## Network source access

The student AI status UI links here so users can locate the corresponding source and license. For another deployment, ensure the link identifies the exact served source version and remains accessible to users.
