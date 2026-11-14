# P4-A Browser Smoke Tests (Playwright / Chromium)

Real-browser smoke coverage for Phase 4-A (issues #80–#83) against the real
Next.js app and the real Spring Boot backend — deliberately separate from the
vitest suites (jsdom/unit), per the Epic #77 browser-E2E requirement.

## Environment (local)

| Service | Where |
|---|---|
| Backend | `http://localhost:8080` — branch `feature/p4-a-monitoring-foundation`, fresh PostgreSQL (Flyway V1..V36), Mailpit for OTP at `:1025` (SMTP) / `:8025` (API) |
| Frontend | `http://localhost:3000` — `next dev` with `NEXT_PUBLIC_API_URL=http://localhost:8080` |

Bring-up (adjust hosts as needed):

```
# isolated DB (never touches dev volumes)
docker run -d --name quizopia_smoke_postgres -e POSTGRES_DB=quizopia \
  -e POSTGRES_USER=quizopia -e POSTGRES_PASSWORD=smoke_pw -p 5433:5432 postgres:17

# backend at the PR HEAD (from backend/)
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/quizopia \
SPRING_DATASOURCE_USERNAME=quizopia SPRING_DATASOURCE_PASSWORD=smoke_pw \
QUIZOPIA_JWT_SECRET_BASE64=... QUIZOPIA_DATA_ENCRYPTION_KEY_BASE64=... \
./mvnw spring-boot:run

# frontend (from frontend/)
NEXT_PUBLIC_API_URL=http://localhost:8080 npx next dev -p 3000
```

## Run

```
npx playwright test --config e2e/playwright.config.ts
```

`global-setup.ts` seeds everything through the REAL APIs: teacher/student/
stranger registrations (OTP cleared via Mailpit), classroom + membership,
question bank + markdown import, exam composition + publish. No test data is
committed to Git.

## Scenarios

- `scenario-a-legacy-exam.spec.ts` — monitoring-OFF exam end-to-end: create →
  schedule → open → start attempt → answer → autosave accepted → change →
  submit → grading correct (also asserts the accepted-answer history count).
- `scenario-b-activity-tracking.spec.ts` — real tab hide/visible, focus
  events, navigation, answer select/change, flag/unflag, real reload: every
  client event recorded EXACTLY ONCE (duplicate/fabrication guard).
- `scenario-c-durable-timeline.spec.ts` — teacher Activity panel: lifecycle +
  browser + ANSWER_ACCEPTED entries, reload durability, source filter, live
  update without reload (ATTEMPT_ACTIVITY over STOMP), IDOR denial.
- `scenario-d-monitoring-config.spec.ts` — UI monitoring config (derived
  camera requirement, recording OFF default, prerequisite gating), backend
  negatives (PUBLIC/zero-class), configuration freeze after open, student
  notice + fail-closed start (`ATTEMPT_MONITORING_START_UNAVAILABLE`).

Evidence (screenshots per key step) lands in `e2e/evidence/`; results JSON in
`e2e-results/` — both gitignored.

## P4-B camera scenarios (E/F/G)

Additional environment on top of the P4-A contract:

- **LiveKit stack up** (System repo root):
  `docker compose --env-file .env.livekit -f docker-compose.livekit.yml up -d`
  (health: `docker ps | grep quizopia_livekit` → healthy; `curl http://localhost:7880` → OK).
- **Backend** runs with the media env from `.env.smoke` at the System root:
  `QUIZOPIA_LIVEKIT_ENABLED=true`, `QUIZOPIA_LIVEKIT_API_KEY/SECRET` matching
  `.env.livekit`, `QUIZOPIA_LIVEKIT_HTTP_URL=http://localhost:7880`,
  `QUIZOPIA_LIVEKIT_WS_URL=ws://localhost:7880`. The SFU must reach the
  backend at host.docker.internal:8080 for signed webhooks.
- **Chromium synthetic cameras**: `playwright.config.ts` launches browsers
  with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`
  and `permissions: ["camera"]`. All published tracks are SIMULATED media —
  every evidence artifact/report must label them as such (issue #84
  acceptance distinguishes real vs simulated).
- Ordering: A→B→C→D→E→F→G (workers=1, same worker process for F+G). F closes
  all five publisher contexts at its end (deterministic disconnects) and
  records session/attempt/student credentials in `.smoke-camera-f.json`;
  G re-opens its own publisher pages (itself the token-renewal recovery
  path). G restarts the `quizopia_livekit` container (requires a docker
  socket on the host).

State files: `.smoke-camera-e.json` (E), `.smoke-camera-f.json` (F, consumed
by G). Evidence: `evidence/E3-*`, `F1-*`, `G3-*`.
