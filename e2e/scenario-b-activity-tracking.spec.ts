import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import { apiJson, inMinutes, loginViaUi, state } from "./helpers";

interface SessionDetail {
  id: number;
  status: string;
}
interface TimelineItem {
  eventId: string;
  eventType: string;
  source: "CLIENT" | "SERVER";
}
interface Timeline {
  items: TimelineItem[];
}

async function openSession(
  teacherToken: string,
  examId: number,
  classroomIds: number[],
  title: string
): Promise<number> {
  const created = await apiJson<SessionDetail>(`/api/exams/${examId}/sessions`, teacherToken, {
    method: "POST",
    body: JSON.stringify({
      title,
      startsAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      endsAt: new Date(Date.now() + 65 * 60_000).toISOString(),
      maxAttempts: 1,
      durationMinutes: 30,
      visibility: "CLASS_RESTRICTED",
      classroomIds,
    }),
  });
  if (created.status !== 201 || !created.body) {
    throw new Error(`session create failed ${created.status}: ${created.raw}`);
  }
  await apiJson(`/api/exams/${examId}/sessions/${created.body.id}/schedule`, teacherToken, {
    method: "POST",
  });
  const open = await apiJson(`/api/exams/${examId}/sessions/${created.body.id}/open`, teacherToken, {
    method: "POST",
  });
  if (open.status !== 200) throw new Error(`open failed: ${open.raw}`);
  return created.body.id;
}

async function timelineTypes(studentToken: string, attemptId: number): Promise<string[]> {
  const page = await apiJson<Timeline>(`/api/attempts/${attemptId}/timeline?limit=100`, studentToken);
  if (page.status !== 200 || !page.body) throw new Error(`timeline failed: ${page.raw}`);
  return page.body.items.map((i) => i.eventType);
}

/**
 * Scenario B — Browser Activity Tracking.
 * The student works in a real attempt: real tab hide/visible, question
 * navigation, answer select/change, flag/unflag, page reload — every client
 * event lands exactly once (no abnormal duplication) in the durable store.
 */
test("Scenario B — browser activity events recorded exactly once", async ({
  page,
}) => {
  const s = state();
  const sessionId = await openSession(
    s.teacher.accessToken,
    s.examId,
    [s.classroomId],
    "Smoke Activity Session"
  );

  await loginViaUi(page, s.student.email, s.student.password);
  await page.goto(`/sessions/${sessionId}`);
  await page.getByRole("button", { name: /start the attempt/i }).click();
  await page.waitForURL(/\/attempts\/\d+/, { timeout: 30_000 });
  const attemptId = Number(page.url().match(/\/attempts\/(\d+)/)![1]);
  await fs.writeFile(`${__dirname}/.smoke-attempt-b.json`, JSON.stringify({ attemptId, sessionId }));

  // Let the attempt shell (and its telemetry listeners) fully mount before
  // driving events — dispatching earlier drops them (verified by probe).
  await page.getByRole("radio", { name: "A 4" }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_500);

  // --- TAB_HIDDEN / TAB_VISIBLE: headless Chromium keeps every page of a
  // context "visible", so drive the REAL visibilitychange listener through
  // the page's own document (patch document.hidden, then dispatch).
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${__dirname}/evidence/B-tab-return.png` });

  // --- WINDOW_FOCUS_LOST / GAINED via real window events ---
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(600);

  // --- QUESTION_NAVIGATED + ANSWER_SELECTED + ANSWER_CHANGED ---
  await page.getByRole("button", { name: "Jump to question 2" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: /Berlin/i }).click();
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: /Paris/i }).click();
  await page.waitForTimeout(600);

  // --- QUESTION_FLAGGED / UNFLAGGED ---
  await page.getByRole("button", { name: "Flag question 2" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Unflag question 2" }).click();
  await page.waitForTimeout(600);

  // --- PAGE_RELOADED via a real reload ---
  await page.reload();
  await page.waitForURL(/\/attempts\/\d+/);
  await page.getByRole("radio", { name: /Paris/i }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: `${__dirname}/evidence/B-after-reload.png`, fullPage: true });

  // Telemetry flushes in batches (≤3s timer) — wait generously, then verify.
  await page.waitForTimeout(6_000);
  const types = await timelineTypes(s.student.accessToken, attemptId);

  const count = (t: string) => types.filter((x) => x === t).length;
  expect(count("ATTEMPT_STARTED"), "server lifecycle recorded").toBe(1);
  expect(count("TAB_HIDDEN"), "tab hidden exactly once").toBe(1);
  expect(count("TAB_VISIBLE"), "tab visible exactly once").toBe(1);
  expect(count("WINDOW_FOCUS_LOST"), "focus lost exactly once").toBe(1);
  expect(count("WINDOW_FOCUS_GAINED"), "focus gained exactly once").toBe(1);
  expect(count("QUESTION_NAVIGATED"), "navigation exactly once").toBe(1);
  expect(count("ANSWER_SELECTED"), "first answer exactly once").toBe(1);
  expect(count("ANSWER_CHANGED"), "changed answer exactly once").toBe(1);
  expect(count("QUESTION_FLAGGED"), "flag exactly once").toBe(1);
  expect(count("QUESTION_UNFLAGGED"), "unflag exactly once").toBe(1);
  expect(count("PAGE_RELOADED"), "reload exactly once").toBe(1);

  // No fabricated events from the re-hydration after reload (FE-4 regression).
  expect(count("ANSWER_CLEARED"), "no fabricated clears on rehydrate").toBe(0);
});
