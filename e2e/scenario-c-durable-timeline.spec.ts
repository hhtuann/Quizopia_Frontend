import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { apiJson, loginViaUi, state } from "./helpers";
import type { SmokeState } from "./helpers";

interface Timeline {
  items: Array<{ eventType: string; source: "CLIENT" | "SERVER" }>;
}
interface AttemptRef {
  attemptId: number;
  sessionId: number;
}

/**
 * Scenario C — Durable Timeline.
 * Teacher views the Activity panel for the Scenario-B attempt: lifecycle,
 * browser events, ANSWER_ACCEPTED history; survives reload; the source
 * filter narrows; a live student action appears without reload (realtime);
 * an unrelated student is denied (IDOR).
 */
test.describe("Scenario C — durable timeline", () => {
  // Lazily populated: globalSetup / scenario B write state files before C runs.
  let s: SmokeState;
  let ref: AttemptRef;
  let sessionUrl = "";
  test.beforeAll(() => {
    s = state();
    ref = JSON.parse(
      readFileSync(`${__dirname}/.smoke-attempt-b.json`, "utf8")
    ) as AttemptRef;
    sessionUrl = `/exams/${s.examId}/sessions/${ref.sessionId}`;
  });
  const attemptId = () => ref.attemptId;

  async function pickStudentAttempt(page: Page): Promise<void> {
    await page.getByLabel("Participant attempt").selectOption(String(ref.attemptId));
    await expect(page.getByText("Attempt started")).toBeVisible({ timeout: 30_000 });
  }
  test("C1 teacher sees lifecycle, browser events and accepted answers", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(sessionUrl);
    await pickStudentAttempt(page);

    // Server-confirmed lifecycle + accepted answers…
    await expect(page.getByText("Attempt started")).toBeVisible();
    await expect(page.getByText("Answer accepted")).toBeVisible();
    // …and client observations, labeled distinctly.
    await expect(page.getByText("Tab hidden")).toBeVisible();
    await expect(page.getByText("Client observation").first()).toBeVisible();
    await expect(page.getByText("Server-confirmed").first()).toBeVisible();
    await page.screenshot({ path: `${__dirname}/evidence/C1-timeline.png`, fullPage: true });
  });

  test("C2 timeline survives reload", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(sessionUrl);
    await pickStudentAttempt(page);

    await page.reload();
    // Picker selection is client state — re-pick after the reload.
    await pickStudentAttempt(page);
    await expect(page.getByText("Tab hidden")).toBeVisible();
    await expect(page.getByText("Answer accepted").first()).toBeVisible();
    await page.screenshot({ path: `${__dirname}/evidence/C2-after-reload.png`, fullPage: true });
  });

  test("C3 source filter narrows the timeline", async ({ page }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(sessionUrl);
    await pickStudentAttempt(page);

    await page.getByRole("group", { name: "Filter by source" }).getByRole("button", { name: "Server" }).click();
    await expect(page.getByText("Tab hidden")).toHaveCount(0);
    await expect(page.getByText("Attempt started")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `${__dirname}/evidence/C3-filter.png`, fullPage: true });
  });

  test("C4 realtime: student action appears without teacher reload", async ({ page, browser }) => {
    await loginViaUi(page, s.teacher.email, s.teacher.password);
    await page.goto(sessionUrl);
    await pickStudentAttempt(page);
    const observationsBefore = await page.getByText("Client observation").count();

    // Student answers in another tab (attempt still IN_PROGRESS) →
    // ANSWER_CHANGED (client) + ANSWER_ACCEPTED (server) + STOMP delta ping.
    // Isolated context: the teacher session (refresh cookie) must not leak
    // into the student's tab.
    const studentCtx = await browser.newContext();
    const studentTab = await studentCtx.newPage();
    await loginViaUi(studentTab, s.student.email, s.student.password);
    await studentTab.goto(`/attempts/${attemptId()}`);
    await studentTab.getByRole("radio", { name: "B 3" }).click();
    await expect(
      studentTab.getByRole("status").filter({ hasText: "Saved" })
    ).toBeVisible({ timeout: 20_000 });

    // No teacher reload: a new client observation arrives via ATTEMPT_ACTIVITY.
    await expect(page.getByText("Client observation")).toHaveCount(observationsBefore + 1, {
      timeout: 30_000,
    });
    await page.screenshot({ path: `${__dirname}/evidence/C4-realtime.png`, fullPage: true });
    await studentCtx.close();
  });

  test("C5 unauthorized student cannot read the timeline (IDOR)", async () => {
    const denied = await apiJson(
      `/api/attempts/${attemptId()}/timeline`,
      s.stranger.accessToken
    );
    expect(denied.status).toBe(403);

    const deniedHistory = await apiJson(
      `/api/attempts/${attemptId()}/answer-history`,
      s.stranger.accessToken
    );
    expect(deniedHistory.status).toBe(403);

    // Owner still reads fine (control).
    const owner = await apiJson<Timeline>(
      `/api/attempts/${attemptId()}/timeline`,
      s.student.accessToken
    );
    expect(owner.status).toBe(200);
    expect(owner.body && owner.body.items.length).toBeGreaterThan(0);
  });
});
