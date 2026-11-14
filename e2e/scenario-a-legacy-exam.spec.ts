import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { apiJson, inMinutes, loginViaUi, state } from "./helpers";
import type { SmokeState } from "./helpers";

interface SessionDetail {
  id: number;
  status: string;
  monitoring: { monitoringEnabled: boolean };
}
interface AnswerHistory {
  totalCount: number;
  items: Array<{ acceptedSequence: number }>;
}
interface AttemptResult {
  score: number | null;
  maxScore: number | null;
}

/**
 * Scenario A — Legacy Exam (monitoring OFF, end-to-end).
 * Teacher creates a class-restricted session without monitoring, opens it;
 * the class student starts an attempt, answers, autosave accepted, changes
 * the answer, autosaves again, submits — grading is still correct.
 */
test.describe("Scenario A — legacy exam", () => {
  // Lazily populated: globalSetup writes the state file before tests run.
  let s: SmokeState;
  test.beforeAll(() => {
    s = state();
  });
  let sessionId = 0;

  test("A1 teacher creates a monitoring-OFF session via UI", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(`/exams/${s.examId}/sessions/new`);

    await page.fill("#session-title", "Smoke Legacy Session");
    await page.fill("#session-startsAt", inMinutes(-5));
    await page.fill("#session-endsAt", inMinutes(55));
    await page.fill("#session-maxAttempts", "1");
    // Default visibility is CLASS_RESTRICTED; select the seeded class.
    await page.getByLabel(new RegExp(s.classroomName, "i")).check();

    // Monitoring section exists and stays OFF (legacy default).
    const enable = page.getByRole("checkbox", { name: /enable exam monitoring/i });
    await expect(enable).toBeVisible();
    await expect(enable).not.toBeChecked();

    await page.getByRole("button", { name: "Create session" }).click();
    // The create flow returns to the exam's Sessions tab.
    await page.waitForURL(/tab=sessions/, { timeout: 30_000 });
    await page.screenshot({ path: `${__dirname}/evidence/A1-session-created.png`, fullPage: true });

    // Resolve the created session id by its unique title (the redirect does
    // not carry it).
    const listed = await apiJson<{ items: Array<{ id: number; title: string }> }>(
      `/api/exams/${s.examId}/sessions?page=0&size=10&search=Smoke%20Legacy%20Session`,
      s.teacher.accessToken
    );
    const created = (listed.body?.items ?? []).find((x) => x.title === "Smoke Legacy Session");
    expect(created).toBeTruthy();
    sessionId = created!.id;

    // Monitoring is OFF in the detail projection.
    const detail = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${sessionId}`,
      s.teacher.accessToken
    );
    expect(detail.body?.monitoring.monitoringEnabled).toBe(false);
  });

  test("A2 teacher schedules + opens the session (real lifecycle)", async () => {
    const sched = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${sessionId}/schedule`,
      s.teacher.accessToken,
      { method: "POST" }
    );
    expect(sched.status).toBe(200);
    const open = await apiJson<SessionDetail>(
      `/api/exams/${s.examId}/sessions/${sessionId}/open`,
      s.teacher.accessToken,
      { method: "POST" }
    );
    expect(open.status).toBe(200);
    expect(open.body?.status).toBe("OPEN");
  });

  test("A3 student starts attempt and autosaves answer changes", async ({ page }) => {
    await loginViaUi(page, s.student.email, s.student.password);
    await page.goto(`/sessions/${sessionId}`);
    await page.getByRole("button", { name: /start the attempt/i }).click();
    await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
    const attemptId = Number(page.url().match(/\/attempts\/(\d+)/)![1]);

    // Q1: select the correct answer (A = 4) and wait for Saved.
    await page.getByRole("radio", { name: /4/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: `${__dirname}/evidence/A3-answer-saved.png`, fullPage: true });

    // Verify server-accepted sequence via the answer-history API.
    const hist1 = await apiJson<AnswerHistory>(
      `/api/attempts/${attemptId}/answer-history`,
      s.student.accessToken
    );
    expect(hist1.status).toBe(200);
    expect(hist1.body?.totalCount).toBe(1);

    // Change the answer (B = 3): second accepted autosave.
    await page.getByRole("radio", { name: "B 3" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({
      timeout: 20_000,
    });

    // Q2: jump via the navigator and answer correctly (B = Paris).
    await page.getByRole("button", { name: "Jump to question 2" }).click();
    await page.getByRole("radio", { name: /Paris/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible({
      timeout: 20_000,
    });

    const hist2 = await apiJson<AnswerHistory>(
      `/api/attempts/${attemptId}/answer-history`,
      s.student.accessToken
    );
    expect(hist2.body?.totalCount).toBe(3); // Q1 v1, Q1 v2, Q2 v1
    await fs.writeFile(`${__dirname}/.smoke-attempt-a.json`, JSON.stringify({ attemptId, sessionId }));
  });

  test("A4 student submits and grading is correct", async ({ page }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { attemptId } = require("./.smoke-attempt-a.json") as { attemptId: number };
    await loginViaUi(page, s.student.email, s.student.password);
    await page.goto(`/attempts/${attemptId}`);

    await page.getByRole("button", { name: "Submit attempt" }).click();
    await page.getByRole("button", { name: "Confirm submit" }).click();
    await page.waitForURL(/\/result/, { timeout: 30_000 });
    await page.screenshot({ path: `${__dirname}/evidence/A4-result.png`, fullPage: true });

    // Grading: Q1 was answered 4 then CHANGED to 3 (wrong), Q2 Paris (right)
    // → final score 1 of 2. Correctness preserved with history writes active.
    const result = await apiJson<AttemptResult>(
      `/api/attempts/${attemptId}/result`,
      s.student.accessToken
    );
    expect(result.status).toBe(200);
    expect(result.body?.score).toBe(1);
    expect(result.body?.maxScore).toBe(2);
  });
});
