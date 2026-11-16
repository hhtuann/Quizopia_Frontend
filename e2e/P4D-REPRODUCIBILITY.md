# P4-D Real-Media E2E — Reproducibility

## Test sources (this PR)
- `e2e/scenario-p-evidence.spec.ts` — Recording OFF + Clips ON (real rolling buffer → real snapshot → real clip).
- `e2e/scenario-p2-recording-on.spec.ts` — **Recording ON (P2 gate)**: real LiveKit WebRTC publish → real FULL egress → MinIO MP4 → ffprobe video-only → teacher browser play/seek → reconnect segments/gaps → attempt submit.

## Camera honesty
Both specs use Chromium's **fake media device** (`--use-fake-device-for-media-stream`, set globally in `playwright.config.ts` launch args) — a synthetic camera, NEVER claimed as a physical webcam. The **media TRANSPORT is real**: the fake-device track is a genuine WebRTC video track published to self-hosted LiveKit, recorded by the real egress service into real MinIO objects. The 5-physical-webcam gate remains P4-F #98.

## Environment requirements
- Docker: media stack `docker compose --env-file .env.livekit -f docker-compose.livekit.yml --profile egress up -d` (livekit, redis, **egress**); dev compose MinIO (`quizopia_minio`, 9000).
- Backend env (`.env.smoke`): `QUIZOPIA_LIVEKIT_*=*` (enabled, key/secret, URLs), `QUIZOPIA_EVIDENCE_MINIO_ENDPOINT=http://localhost:9000`, `QUIZOPIA_EVIDENCE_MINIO_ACCESS_KEY/SECRET_KEY`, `QUIZOPIA_MEDIA_STORAGE_EGRESS_ENDPOINT=http://host.docker.internal:9000`, `QUIZOPIA_FFMPEG_COMMAND=<absolute ffmpeg.exe path>`.
- `SMOKE_FFPROBE` env for the spec's ffprobe verification (absolute path on Windows dev; plain `ffprobe` on CI/Linux).
- Smoke Postgres: fresh `quizopia_smoke_postgres` on 5433 per chain (registration rate limit resets with the DB).

## Commands (Windows dev host)
```
docker stop quizopia_backend quizopia_frontend
# kill host :8080/:3000 listeners (NEVER while docker dev containers publish those ports — stop containers first)
docker rm -f quizopia_smoke_postgres && docker run -d --name quizopia_smoke_postgres \
  -e POSTGRES_DB=quizopia -e POSTGRES_USER=quizopia -e POSTGRES_PASSWORD=smoke_pw -p 5433:5432 postgres:17
cd backend && export $(grep -v '^#' ../.env.smoke | grep -E "^SMOKE_|^QUIZOPIA_LIVEKIT|^QUIZOPIA_EVIDENCE" | xargs) && \
  SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/quizopia ... mvnw.cmd spring-boot:run
cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8080 npx next dev -p 3000
export SMOKE_FFPROBE="<ffprobe abs path>" && npx playwright test --config e2e/playwright.config.ts
```

## Evidence artifacts
- `e2e/evidence/P2-recording-playback.png` — teacher browser playback of a real segment.
- Backend log markers: `recording started (kind=FULL|ROLLING, attempt=…)`; DB: `monitoring_recording_jobs` COMPLETE rows with real bytes; `monitoring_evidence_access` rows for each minted playback URL.
- ffprobe output asserted IN-SPEC: `codec_type=video` present, `codec_type=audio` ABSENT, duration > 5s.

## Last verified
Full chain **32/32** on the exact final HEADs of Backend #27 / Frontend #28 (see PR checks): A–H (29) + Scenario P (2) + Scenario P2 (1), 7.3 min wall time, real media stack.
