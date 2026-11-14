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
