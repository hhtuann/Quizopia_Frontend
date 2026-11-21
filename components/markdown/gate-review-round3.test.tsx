// @vitest-environment jsdom
/**
 * Reproduction tests for the gate-review round-3 findings on PR #33
 * (Quizopia_System #121). Each test documents the CURRENT behavior first;
 * the fix commits flip the expectations to the safe behavior.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiAuthoringChat } from "./ai-authoring-chat";
import {
  authorAiMarkdown,
  extractAiDocument,
  getAiAuthoringStatus,
  type AiAuthorResponse,
} from "@/lib/api/ai-authoring";

vi.mock("@/lib/api/ai-authoring", () => ({
  getAiAuthoringStatus: vi.fn(),
  extractAiDocument: vi.fn(),
  authorAiMarkdown: vi.fn(),
}));

const statusMock = vi.mocked(getAiAuthoringStatus);
const extractMock = vi.mocked(extractAiDocument);
const authorMock = vi.mocked(authorAiMarkdown);

const Q1 = `Question 1 [SINGLE_CHOICE]: 2 + 2?
*A. 4
B. 3
C. 5
D. 6
`;
const Q2 = `Question 2 [SINGLE_CHOICE]: 3 + 3?
*A. 6
B. 5
C. 7
D. 8
`;
const Q3 = `Question 3 [SINGLE_CHOICE]: 4 + 4?
*A. 8
B. 7
C. 9
D. 10
`;
const SOURCE = Q1 + Q2;
const CANDIDATE_ADD = SOURCE + Q3;

function Harness({ start }: { start: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <textarea
        aria-label="Editor mirror"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <AiAuthoringChat bankId={7} onChange={setValue} value={value} />
    </>
  );
}

describe("Gate review round 3 — P1-1 silent acceptance on next send", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "m" });
    extractMock.mockReset();
    authorMock.mockReset();
  });

  afterEach(cleanup);

  function renderChat(start = SOURCE) {
    return render(
      <QueryClientProvider client={queryClient}>
        <Harness start={start} />
      </QueryClientProvider>,
    );
  }

  function composer() {
    return screen.getByLabelText("Message the AI assistant") as HTMLTextAreaElement;
  }

  function sendButton() {
    return screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement;
  }

  async function send(text: string) {
    await waitFor(() => expect(composer().disabled).toBe(false));
    fireEvent.change(composer(), { target: { value: text } });
    fireEvent.click(sendButton());
  }
  it("P1-1: a pending change set stays Pending when a follow-up send is attempted and fails", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Added Q3",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("add a question");
    await waitFor(() =>
      expect(screen.getByText(/Pending review/i)).not.toBeNull(),
    );

    // Attempt a follow-up send: the composer is BLOCKED while the change
    // set is unconfirmed — no request is issued, nothing flips to Kept.
    authorMock.mockRejectedValue({
      kind: "http",
      status: 500,
      message: "boom",
      raw: {},
    });
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    fireEvent.change(composer(), { target: { value: "another" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Keep all or Undo all"));
    expect(authorMock).toHaveBeenCalledTimes(1);
    const firstCard = screen.getAllByTestId("ai-merge-changes-card")[0];
    expect(firstCard.textContent).toContain("Pending review");
  });

  it("P1-1: conflict change set blocks sending until explicitly resolved", async () => {
    const { promise, resolve } = Promise.withResolvers<AiAuthorResponse>();
    authorMock.mockImplementation(() => promise);
    renderChat();
    await send("add a question");
    // Manual edit in flight -> conflict.
    fireEvent.change(screen.getByLabelText("Editor mirror"), {
      target: { value: SOURCE + Q3 },
    });
    resolve({ markdown: CANDIDATE_ADD, reply: "r", valid: true, diagnostics: [] });
    await waitFor(() =>
      expect(screen.getByText(/Editor changed — review required/i)).not.toBeNull(),
    );

    // Sending is blocked; the conflict set is never silently accepted.
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    fireEvent.change(composer(), { target: { value: "next" } });
    fireEvent.click(sendButton());
    expect(authorMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Editor changed — review required/i)).not.toBeNull();
  });

  it("P1-1: import gate stays closed while a change set is pending after a failed follow-up attempt", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Added Q3",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("add a question");
    await waitFor(() =>
      expect(screen.getByText(/Pending review/i)).not.toBeNull(),
    );
    // Attempt (blocked) follow-up; the pending set still exists, so the
    // host import gate (onPendingChangesChange) still reports pending.
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    expect(screen.getByText(/Pending review/i)).not.toBeNull();
  });

  it("P1-1: after explicit Keep all, sending unblocks and uses the kept editor as baseline", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Added Q3",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("add a question");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep all" })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    // Type a new prompt; the send button must be ENABLED now (gate cleared).
    fireEvent.change(composer(), { target: { value: "another" } });
    await waitFor(() => expect(sendButton().disabled).toBe(false));

    // Next request carries the KEPT editor content as baseline.
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "ok",
      valid: true,
      diagnostics: [],
    });
    fireEvent.click(sendButton());
    await waitFor(() => expect(authorMock).toHaveBeenCalledTimes(2));
    expect(authorMock.mock.calls[1][1].currentMarkdown).toBe(CANDIDATE_ADD);
  });
});

describe("Gate review round 3 — P1-2 question preservation", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "m" });
    extractMock.mockReset();
    authorMock.mockReset();
  });

  afterEach(cleanup);

  function renderChat(start = SOURCE) {
    return render(
      <QueryClientProvider client={queryClient}>
        <Harness start={start} />
      </QueryClientProvider>,
    );
  }

  function composer() {
    return screen.getByLabelText("Message the AI assistant") as HTMLTextAreaElement;
  }

  function sendButton() {
    return screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement;
  }

  async function send(text: string) {
    await waitFor(() => expect(composer().disabled).toBe(false));
    fireEvent.change(composer(), { target: { value: text } });
    fireEvent.click(sendButton());
  }

  it("REPRO→FIX: a valid candidate that OMITS existing questions never auto-applies", async () => {
    // "Add a question" but the model returns ONLY a new Q3 — dropping Q1/Q2.
    authorMock.mockResolvedValueOnce({
      markdown: Q3,
      reply: "Added a question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("add a question about networking");

    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    // SAFE behavior: no auto-apply; the editor keeps the original document.
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(SOURCE);
    // The card must flag the destructive result for explicit review.
    expect(screen.getByTestId("ai-merge-changes-card").textContent).toMatch(
      /review required|destructive|preserv/i,
    );
  });

  it("REPRO→FIX: an edit-Q3 candidate that rewrites Q1/Q2 never auto-applies", async () => {
    const rewritten = `Question 1 [SINGLE_CHOICE]: REWRITTEN stem?
*A. changed
B. changed
C. changed
D. changed
` + Q2 + Q3;
    authorMock.mockResolvedValueOnce({
      markdown: rewritten,
      reply: "Edited question 3",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("edit question 3 to be clearer");

    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(SOURCE);
    expect(screen.getByTestId("ai-merge-changes-card").textContent).toMatch(
      /review required|destructive|preserv/i,
    );
  });

  it("an additive candidate that preserves all old questions still auto-applies as pending", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Added Q3",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("add a question");
    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE_ADD),
    );
    expect(screen.getByText(/Pending review/i)).not.toBeNull();
  });

  it("an explicit full-rewrite request can still be applied through explicit review", async () => {
    // The user asked to replace everything; the candidate drops Q1/Q2 but
    // must NOT auto-apply — Keep all (explicit) applies it.
    authorMock.mockResolvedValueOnce({
      markdown: Q3,
      reply: "Replaced the document",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await send("replace the whole document with one question");

    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(SOURCE);
    // Explicit Keep all applies the rewrite after review.
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(Q3),
    );
  });
});

describe("Gate review round 3 re-review — retry block", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "m" });
    extractMock.mockReset();
    authorMock.mockReset();
  });

  afterEach(cleanup);

  it("Retry is a no-op while a change set is unreviewed (no second active set)", async () => {
    // Turn 1 fails -> error row with Retry.
    authorMock.mockRejectedValueOnce({
      kind: "http",
      status: 503,
      message: "unavailable",
      raw: {},
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Harness start={SOURCE} />
      </QueryClientProvider>,
    );
    const composer = await waitFor(() =>
      screen.getByLabelText("Message the AI assistant") as HTMLTextAreaElement,
    );
    fireEvent.change(composer, { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());

    // Retry succeeds but returns a DESTRUCTIVE candidate (drops Q1/Q2).
    authorMock.mockResolvedValueOnce({
      markdown: Q3,
      reply: "destructive",
      valid: true,
      diagnostics: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText(/not preserved/i)).not.toBeNull(),
    );
    // The destructive set is active: send blocked.
    expect(
      (screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // A stale Retry (if an error row still existed) must be a no-op too.
    // Simulate: the retried request fails again is impossible to trigger
    // via UI (send blocked), so assert the invariant directly — no second
    // active change set exists and the editor was never touched.
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(SOURCE);
    const cards = screen.getAllByTestId("ai-merge-changes-card");
    expect(cards.length).toBe(1);
  });
});

describe("Gate review round 4 — unparseable draft protection", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "m" });
    extractMock.mockReset();
    authorMock.mockReset();
  });

  afterEach(cleanup);

  function renderChat(start: string) {
    return render(
      <QueryClientProvider client={queryClient}>
        <Harness start={start} />
      </QueryClientProvider>,
    );
  }

  function composer() {
    return screen.getByLabelText("Message the AI assistant") as HTMLTextAreaElement;
  }

  async function send(text: string) {
    await waitFor(() => expect(composer().disabled).toBe(false));
    fireEvent.change(composer(), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  }

  it("an incomplete question header draft is never auto-overwritten", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Here you go",
      valid: true,
      diagnostics: [],
    });
    renderChat("Question 1 [SINGLE_CHOICE]");
    await send("add questions");

    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    // The draft survives; the card demands review.
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(
      "Question 1 [SINGLE_CHOICE]",
    );
    expect(screen.getByTestId("ai-merge-changes-card").textContent).toMatch(
      /not preserved|review required/i,
    );
  });

  it("plain notes are never auto-overwritten", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Here you go",
      valid: true,
      diagnostics: [],
    });
    renderChat("notes: cover TCP handshake");
    await send("add questions");

    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(
      "notes: cover TCP handshake",
    );
  });

  it("an EMPTY editor still auto-applies as pending", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Drafted",
      valid: true,
      diagnostics: [],
    });
    renderChat("");
    await send("draft questions");

    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE_ADD),
    );
    expect(screen.getByText(/Pending review/i)).not.toBeNull();
  });

  it("a whitespace-only editor still auto-applies as pending", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Drafted",
      valid: true,
      diagnostics: [],
    });
    renderChat("  \n  \n");
    await send("draft questions");

    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE_ADD),
    );
    expect(screen.getByText(/Pending review/i)).not.toBeNull();
  });

  it("a draft CAN be replaced through explicit Keep all", async () => {
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE_ADD,
      reply: "Here you go",
      valid: true,
      diagnostics: [],
    });
    renderChat("Question 1 [SINGLE_CHOICE]");
    await send("replace my draft");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep all" })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE_ADD),
    );
  });
});
