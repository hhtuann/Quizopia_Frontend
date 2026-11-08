// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForkPublicationDialog } from "./ForkPublicationDialog";
import {
  forkPublication,
  type ForkDraftResponse,
} from "@/lib/api/community-fork";
import type * as ForkApi from "@/lib/api/community-fork";

/**
 * P3-B2-FE (#48) — "Fork this quiz" consent dialog: explicit consent gate,
 * per-action Idempotency-Key lifecycle (fresh per action, SAME across
 * manual network retries, NEW after a 409), double-submit disable, the
 * 200/201/403/409/429/404/401 outcome copy, success attribution before
 * `/exams/{targetExamId}` navigation, and the modal focus trap. Module-mock
 * style follows publish-to-community-dialog.test.tsx (real classifier +
 * real hooks; transport mocked only).
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// Real constants/classifier, mocked transport only — the use-community-fork
// hooks stay real so the key lifecycle + invalidation are exercised.
vi.mock("@/lib/api/community-fork", async (importOriginal) => {
  const actual = await importOriginal<typeof ForkApi>();
  return { ...actual, forkPublication: vi.fn() };
});

const fork = vi.mocked(forkPublication);

const onClose = vi.fn();

const PUBLICATION = {
  publicationId: 7,
  title: "Algebra fundamentals",
  authorName: "MathWhiz",
};

function draft(overrides: Partial<ForkDraftResponse> = {}): ForkDraftResponse {
  return {
    targetExamId: 501,
    sourcePublicationId: 7,
    sourceTitle: "Algebra fundamentals",
    authorAlias: "MathWhiz",
    forkedAt: "2026-11-08T10:00:00Z",
    ...overrides,
  };
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <ForkPublicationDialog
          open
          publication={PUBLICATION}
          onClose={onClose}
        />
      </QueryClientProvider>
    </StrictMode>
  );
}

/** Check the consent box — the explicit-consent gate for the confirm button. */
async function consent() {
  fireEvent.click(
    await screen.findByLabelText(/independent, editable copy of this quiz/i)
  );
}

async function openAndConsent() {
  mount();
  await screen.findByRole("dialog");
  await consent();
  return screen.getByRole("button", { name: "Fork this quiz" });
}

/** Keys observed by the transport spy (call arg index 1). */
function sentKeys(): string[] {
  return fork.mock.calls.map((call) => call[1]);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const networkError = { kind: "network" as const, message: "offline", raw: {} };
const apiError = (status: number, code: string) => ({
  kind: "api" as const,
  status,
  code,
  message: "err",
  raw: {},
});

beforeEach(() => {
  fork.mockReset();
  push.mockReset();
  onClose.mockReset();
});
afterEach(cleanup);

describe("ForkPublicationDialog — explicit consent", () => {
  it("spells out the fork consequences (independent draft, answers copied, credit) before any request", async () => {
    mount();
    await screen.findByRole("dialog");

    expect(screen.getByText(/independent DRAFT quiz/i)).toBeTruthy();
    expect(
      screen.getByText(/Every question and its correct answers/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/“Algebra fundamentals” by MathWhiz/i)
    ).toBeTruthy();
    expect(fork).not.toHaveBeenCalled();
  });

  it("keeps confirm disabled (and silent) until the acknowledgment is checked", async () => {
    mount();
    const confirm = (await screen.findByRole("button", {
      name: "Fork this quiz",
    })) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.click(confirm);
    await consent();
    expect(
      (screen.getByRole("button", { name: "Fork this quiz" }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(fork).not.toHaveBeenCalled();
  });

  it("lands focus on the consent checkbox when it opens", async () => {
    mount();
    const box = await screen.findByLabelText(
      /independent, editable copy of this quiz/i
    );
    expect(document.activeElement).toBe(box);
  });
});

describe("ForkPublicationDialog — teacher happy path (201)", () => {
  it("sends one UUID-keyed POST, shows attribution, then navigates to /exams/{targetExamId}", async () => {
    fork.mockResolvedValue(draft());
    const confirm = await openAndConsent();

    fireEvent.click(confirm);

    expect(await screen.findByText("Your draft is ready")).toBeTruthy();
    // Attribution credit from the fork response — shown BEFORE navigation.
    expect(screen.getByText(/Forked from/i)).toBeTruthy();
    expect(screen.getByText(/“Algebra fundamentals”/i)).toBeTruthy();
    expect(screen.getByText("MathWhiz")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open your draft" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/exams/501");
    expect(onClose).toHaveBeenCalled();

    expect(fork).toHaveBeenCalledTimes(1);
    expect(fork).toHaveBeenCalledWith(7, expect.any(String));
    expect(sentKeys()[0]).toMatch(UUID_RE);
  });

  it("stays on the success view via “Not now” without navigating", async () => {
    fork.mockResolvedValue(draft());
    const confirm = await openAndConsent();
    fireEvent.click(confirm);
    await screen.findByText("Your draft is ready");

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(push).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("renders only the §7 response allowlist — no answer/option material in the DOM", async () => {
    const poisoned = {
      ...draft(),
      answerKey: "B",
      answer_key: "B",
      isCorrect: true,
      optionKey: "B",
      optionContent: "sneaky option text",
      questions: ["What is 2+2?"],
      sourceExamId: 99,
      username: "secret-username",
    } as unknown as ForkDraftResponse;
    fork.mockResolvedValue(poisoned);
    const confirm = await openAndConsent();

    fireEvent.click(confirm);
    await screen.findByText("Your draft is ready");

    const html = document.body.innerHTML;
    for (const forbidden of [
      "answerKey",
      "answer_key",
      "isCorrect",
      "optionKey",
      "optionContent",
      "sneaky option text",
      "What is 2+2",
      "sourceExamId",
      "secret-username",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("double submit is impossible — the button disables for the whole flight", async () => {
    const { promise, resolve } = Promise.withResolvers<ForkDraftResponse>();
    fork.mockReturnValue(promise);
    const confirm = await openAndConsent();

    fireEvent.click(confirm);
    const busy = (await screen.findByRole("button", {
      name: /Forking…/,
    })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(busy);

    await waitFor(() => expect(fork).toHaveBeenCalledTimes(1));
    resolve(draft());
    // The disabled second click added no second request.
    await waitFor(() => expect(fork).toHaveBeenCalledTimes(1));
    await screen.findByText("Your draft is ready");
  });
});

describe("ForkPublicationDialog — idempotent retries keep ONE key per action", () => {
  it("retries a network failure with the SAME key (manual button, no auto-loop) and lands on the 200 idempotent success", async () => {
    fork.mockRejectedValueOnce(networkError);
    fork.mockResolvedValueOnce(draft({ targetExamId: 777 }));
    const confirm = await openAndConsent();

    fireEvent.click(confirm);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
    expect(fork).toHaveBeenCalledTimes(1);

    // Manual retry only — nothing fired between the failure and the click.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Your draft is ready")).toBeTruthy();
    expect(fork).toHaveBeenCalledTimes(2);
    const [firstKey, secondKey] = sentKeys();
    expect(firstKey).toMatch(UUID_RE);
    expect(secondKey).toBe(firstKey);

    fireEvent.click(screen.getByRole("button", { name: "Open your draft" }));
    expect(push).toHaveBeenCalledWith("/exams/777");
  });

  it("drops the burned key after a 409 and starts a NEW action (new key)", async () => {
    fork.mockRejectedValueOnce(
      apiError(409, "COMMUNITY_IDEMPOTENCY_CONFLICT")
    );
    fork.mockResolvedValueOnce(draft());
    const confirm = await openAndConsent();

    fireEvent.click(confirm);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("start the fork again");

    fireEvent.click(screen.getByRole("button", { name: "Start a new fork" }));
    // Fresh consent state: unchecked box, disabled confirm.
    const reConfirm = screen.getByRole("button", {
      name: "Fork this quiz",
    }) as HTMLButtonElement;
    expect(reConfirm.disabled).toBe(true);

    await consent();
    fireEvent.click(screen.getByRole("button", { name: "Fork this quiz" }));
    await screen.findByText("Your draft is ready");

    const [burnedKey, freshKey] = sentKeys();
    expect(freshKey).toMatch(UUID_RE);
    expect(freshKey).not.toBe(burnedKey);
  });

  it("generates a fresh key when the dialog is reopened (new action, new mount)", async () => {
    fork.mockResolvedValue(draft());
    const confirm = await openAndConsent();
    fireEvent.click(confirm);
    await screen.findByText("Your draft is ready");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    const firstKey = sentKeys()[0];
    cleanup();
    fork.mockClear();

    // The parent's `{open && <Dialog/>}` gate: closing unmounts the dialog,
    // so reopening is a remount — a NEW action with a NEW key (§10).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <ForkPublicationDialog
            open
            publication={PUBLICATION}
            onClose={onClose}
          />
        </QueryClientProvider>
      </StrictMode>
    );
    await consent();
    fireEvent.click(screen.getByRole("button", { name: "Fork this quiz" }));
    await screen.findByText("Your draft is ready");

    expect(sentKeys()[0]).toMatch(UUID_RE);
    expect(sentKeys()[0]).not.toBe(firstKey);
  });
});

describe("ForkPublicationDialog — §7/§8 outcome copy", () => {
  it("explains a 403 policy change (no retry offered)", async () => {
    fork.mockRejectedValueOnce(apiError(403, "COMMUNITY_FORK_NOT_ALLOWED"));
    const confirm = await openAndConsent();
    fireEvent.click(confirm);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no longer allowed");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("surfaces the neutral no-longer-available copy on 404", async () => {
    fork.mockRejectedValueOnce(apiError(404, "COMMUNITY_NOT_FOUND"));
    const confirm = await openAndConsent();
    fireEvent.click(confirm);

    expect(
      (await screen.findByRole("alert")).textContent
    ).toContain("no longer available");
  });

  it("surfaces the expired-session copy on 401", async () => {
    fork.mockRejectedValueOnce(apiError(401, "AUTH_ACCESS_DENIED"));
    const confirm = await openAndConsent();
    fireEvent.click(confirm);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "session has expired"
    );
  });

  it("makes the 429 copy Retry-After aware", async () => {
    fork.mockRejectedValueOnce({
      kind: "api",
      status: 429,
      code: "COMMUNITY_RATE_LIMITED",
      message: "Too many requests",
      raw: {
        isAxiosError: true,
        response: { status: 429, headers: { "retry-after": "30" } },
      },
    });
    const confirm = await openAndConsent();
    fireEvent.click(confirm);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too many fork attempts");
    expect(alert.textContent).toContain("30 second");
  });

  it("falls back to a generic 429 wait hint without Retry-After", async () => {
    fork.mockRejectedValueOnce(apiError(429, "COMMUNITY_RATE_LIMITED"));
    const confirm = await openAndConsent();
    fireEvent.click(confirm);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("wait a moment");
  });
});

describe("ForkPublicationDialog — a11y baseline", () => {
  it("traps Tab inside the dialog panel (wraps last → first)", async () => {
    const confirm = await openAndConsent();
    confirm.focus();

    fireEvent.keyDown(window, { key: "Tab" });

    expect(document.activeElement).toBe(
      screen.getByLabelText(/independent, editable copy of this quiz/i)
    );
  });

  it("traps Shift+Tab inside the dialog panel (wraps first → last)", async () => {
    await openAndConsent();
    const box = screen.getByLabelText(
      /independent, editable copy of this quiz/i
    );
    box.focus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Fork this quiz" })
    );
  });

  it("closes on Esc when idle and stays put while a fork is in flight", async () => {
    const { promise } = Promise.withResolvers<ForkDraftResponse>();
    fork.mockReturnValue(promise);
    const confirm = await openAndConsent();

    fireEvent.click(confirm);
    await screen.findByRole("button", { name: /Forking…/ });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Esc when idle (action reset, parent informed)", async () => {
    mount();
    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
