// @vitest-environment jsdom
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

const SOURCE = `Question 1 [SINGLE_CHOICE]: 2 + 2?
*A. 4
B. 3
C. 5
D. 6
`;
const CANDIDATE = `${SOURCE}Question 2 [SINGLE_CHOICE]: 3 + 3?
*A. 6
B. 5
C. 7
D. 8
`;
/** Stateful host: mirrors the real editor (`value` prop) and records onChange. */


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

describe("AiAuthoringChat", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "test-model" });
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

  function mirror() {
    return screen.getByLabelText("Editor mirror") as HTMLTextAreaElement;
  }

  function composerBox() {
    return screen.getByLabelText("Message the AI assistant") as HTMLTextAreaElement;
  }

  function sendButton() {
    return screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement;
  }

  function uploadButton() {
    return screen.getByRole("button", { name: "Upload document" }) as HTMLButtonElement;
  }

  async function sendInstruction(text: string) {
    await waitFor(() => expect(composerBox().disabled).toBe(false));
    fireEvent.change(composerBox(), { target: { value: text } });
    await waitFor(() => expect(sendButton().disabled).toBe(false));
    fireEvent.click(sendButton());
  }

  it("shows the unavailable banner and disables all inputs when the server reports unavailable", async () => {
    statusMock.mockResolvedValue({ enabled: true, available: false, model: "test-model" });
    renderChat();

    await waitFor(() =>
      expect(screen.getByText(/AI Assistant is unavailable on the server/)).not.toBeNull(),
    );
    expect(sendButton().disabled).toBe(true);
    expect(composerBox().disabled).toBe(true);
    expect(uploadButton().disabled).toBe(true);
  });

  it("treats a status probe failure (e.g. 403) as unavailable", async () => {
    statusMock.mockRejectedValue({ kind: "http", status: 403, message: "Forbidden", raw: {} });
    renderChat();

    await waitFor(() =>
      expect(screen.getByText(/AI Assistant is unavailable on the server/)).not.toBeNull(),
    );
    expect(sendButton().disabled).toBe(true);
  });

  it("Enter sends, Shift+Enter inserts a newline, IME Enter does not send", async () => {
    authorMock.mockResolvedValue({
      markdown: SOURCE,
      reply: "ok",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await waitFor(() => expect(composerBox().disabled).toBe(false));

    // Shift+Enter inserts a newline (no send).
    fireEvent.change(composerBox(), { target: { value: "line one" } });
    fireEvent.keyDown(composerBox(), { key: "Enter", shiftKey: true });
    expect(authorMock).not.toHaveBeenCalled();

    // IME-composing Enter does not send.
    fireEvent.keyDown(composerBox(), { key: "Enter", nativeEvent: { isComposing: true } });
    expect(authorMock).not.toHaveBeenCalled();

    // Plain Enter sends.
    fireEvent.keyDown(composerBox(), { key: "Enter" });
    await waitFor(() => expect(authorMock).toHaveBeenCalledTimes(1));
    expect(authorMock.mock.calls[0][1].instruction).toBe("line one");
  });

  it("guards duplicate submissions while a send is pending", async () => {
    const { promise } = Promise.withResolvers<AiAuthorResponse>();
    authorMock.mockImplementation(() => promise);
    renderChat();
    await waitFor(() => expect(composerBox().disabled).toBe(false));

    fireEvent.change(composerBox(), { target: { value: "Add a question" } });
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().disabled).toBe(true));
    // Send button disabled while pending — clicking again does nothing.
    fireEvent.click(sendButton());
    expect(authorMock).toHaveBeenCalledTimes(1);
  });

  it("uploads a document and lists it in the Sources manager, not as chips", async () => {
    extractMock.mockResolvedValue({
      name: "notes.txt",
      text: "extracted text",
      truncated: false,
      charCount: 5,
    });
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));

    const file = new File(["raw"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(extractMock).toHaveBeenCalledTimes(1));
    expect(extractMock.mock.calls[0][0]).toBe(7);
    expect(extractMock.mock.calls[0][1]).toBe(file);

    // The composer shows the compact counter; no chip row appears.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /1 source/i })).not.toBeNull(),
    );
    expect(screen.queryByLabelText("Uploaded documents")).toBeNull();

    // The manager lists the source with its status.
    fireEvent.click(screen.getByRole("button", { name: /1 source/i }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Sources" })).not.toBeNull(),
    );
    expect(screen.getByText("notes.txt")).not.toBeNull();
    expect(screen.getByText(/5 chars/)).not.toBeNull();
  });

  it("rejects files over 5 MiB client-side without calling the API", async () => {
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf");
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: { files: [big] },
    });

    // The failure lives in the Sources manager, not a full-width banner.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /1 source/i })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /1 source/i }));
    await waitFor(() =>
      expect(screen.getByText(/larger than 5 MiB/)).not.toBeNull(),
    );
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("shows the extraction failure next to the failed source", async () => {
    extractMock.mockRejectedValue({
      kind: "api",
      status: 422,
      code: "AI_DOCUMENT_UNREADABLE",
      message: "Could not read the document",
      raw: {},
    });
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: { files: [new File(["raw"], "broken.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /1 source/i })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /1 source/i }));
    await waitFor(() =>
      expect(screen.getByText(/Could not read the document/)).not.toBeNull(),
    );
  });

  it("sends instruction, current markdown, selected documents and prior history", async () => {
    extractMock.mockResolvedValue({
      name: "notes.txt",
      text: "extracted text",
      truncated: false,
      charCount: 5,
    });
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: { files: [new File(["raw"], "notes.txt", { type: "text/plain" })] },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /1 source/i })).not.toBeNull(),
    );
    const { promise: firstPromise, resolve: resolveFirst } =
      Promise.withResolvers<AiAuthorResponse>();
    authorMock.mockImplementation(() => firstPromise);
    await sendInstruction("Add a question");

    expect(authorMock).toHaveBeenCalledWith(7, {
      instruction: "Add a question",
      currentMarkdown: SOURCE,
      documents: [{ name: "notes.txt", text: "extracted text" }],
      history: [],
    });
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    resolveFirst({ markdown: CANDIDATE, reply: "Done", valid: true, diagnostics: [] });
    await waitFor(() => expect(screen.getByText("Done")).not.toBeNull());

    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Second",
      valid: true,
      diagnostics: [],
    });
    await sendInstruction("Another one");
    await waitFor(() => expect(authorMock).toHaveBeenCalledTimes(2));
    expect(authorMock.mock.calls[1][1].history).toEqual([
      { role: "user", content: "Add a question" },
      { role: "assistant", content: "Done" },
    ]);
  });

  it("auto-applies a valid candidate as PENDING and shows true diff counts", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");

    await waitFor(() => expect(screen.getByText("Here is your question")).not.toBeNull());
    // Pending state + honest counts: CANDIDATE adds 5 lines, deletes 0.
    const card = screen.getByTestId("ai-merge-changes-card");
    expect(card.textContent).toContain("Pending review");
    expect(card.textContent).toContain("+5");
    expect(card.textContent).toContain("-0");
    // Auto-applied to the editor provisionally.
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));
  });

  it("Keep all seals the change set; Undo all restores the pre-apply source", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Keep all" })).not.toBeNull(),
    );
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    await waitFor(() =>
      expect(screen.getByText(/accepted and sealed/i)).not.toBeNull(),
    );
    // Sealed: no more Undo all offered for this change set.
    expect(screen.queryByRole("button", { name: "Undo all" })).toBeNull();
    expect(mirror().value).toBe(CANDIDATE);
  });

  it("Undo all restores the pre-AI snapshot", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    fireEvent.click(screen.getByRole("button", { name: "Undo all" }));
    await waitFor(() => expect(mirror().value).toBe(SOURCE));
    expect(screen.getByText(/Change set undone/i)).not.toBeNull();
  });

  /** Safety: Undo must not silently delete post-apply manual edits. */
  it("asks before Undo all when the teacher edited after the pending apply", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    const MANUAL = `${CANDIDATE}Question 30 [SINGLE_CHOICE]: manual edit?
`;
    fireEvent.change(mirror(), { target: { value: MANUAL } });

    fireEvent.click(screen.getByRole("button", { name: "Undo all" }));
    expect(screen.getByText(/discards those manual edits/i)).not.toBeNull();
    // Nothing overwritten yet.
    expect(mirror().value).toBe(MANUAL);

    fireEvent.click(screen.getByRole("button", { name: "Restore anyway" }));
    await waitFor(() => expect(mirror().value).toBe(SOURCE));
  });

  /** Safety: editor changed in flight — never silently overwrite. */
  it("marks a conflict and does NOT auto-apply when the editor changed in flight", async () => {
    const { promise: authorPromise, resolve: resolveAuthor } =
      Promise.withResolvers<AiAuthorResponse>();
    authorMock.mockImplementation(() => authorPromise);
    renderChat();
    await sendInstruction("Add a question");

    const EDITED = `${SOURCE}Question 9 [TRUE_FALSE_MATRIX]: edited?
`;
    fireEvent.change(mirror(), { target: { value: EDITED } });

    resolveAuthor({
      markdown: CANDIDATE,
      reply: "Here you go",
      valid: true,
      diagnostics: [],
    });
    await waitFor(() =>
      expect(screen.getByTestId("ai-merge-changes-card")).not.toBeNull(),
    );
    // Conflict state; editor untouched.
    expect(screen.getByText(/Editor changed — review required/i)).not.toBeNull();
    expect(mirror().value).toBe(EDITED);

    // Explicit Keep all applies against the current editor (snapshot kept).
    fireEvent.click(screen.getByRole("button", { name: "Keep all" }));
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));
  });

  /** Safety: invalid candidates never auto-apply. */
  it("never auto-applies an invalid candidate and surfaces diagnostics", async () => {
    authorMock.mockResolvedValue({
      markdown: "garbage",
      reply: "Draft ready",
      valid: false,
      diagnostics: [
        {
          code: "QUIZ_MD_MISSING_TYPE",
          questionNumber: 1,
          line: 3,
          column: 1,
          message: "Question type missing",
        },
      ],
    });
    renderChat();
    await sendInstruction("Add a question");

    await waitFor(() => expect(screen.getByText("Draft ready")).not.toBeNull());
    const card = screen.getByTestId("ai-merge-changes-card");
    expect(card.textContent).toContain("Invalid");
    expect(card.textContent).toContain("QUIZ_MD_MISSING_TYPE");
    // Editor untouched.
    expect(mirror().value).toBe(SOURCE);
    // Keep all is disabled for invalid candidates.
    expect((screen.getByRole("button", { name: "Keep all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  /** Gate review P2: every selected file must land, in selection order. */
  it("multi-file upload attaches every document in order despite one failure", async () => {
    extractMock.mockImplementation(async (_bankId: number, file: File) => {
      if (file.name === "b.txt") {
        throw { kind: "api", status: 422, code: "AI_DOCUMENT_NO_TEXT", message: "No text in b", raw: {} };
      }
      return {
        name: file.name,
        text: `text of ${file.name}`,
        truncated: false,
        charCount: 20,
      };
    });
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));

    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: {
        files: [
          new File(["a"], "a.txt", { type: "text/plain" }),
          new File(["b"], "b.txt", { type: "text/plain" }),
          new File(["c"], "c.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => expect(extractMock).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /3 sources/i })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /3 sources/i }));
    // Both successes listed and attached; the failure listed with its error.
    expect(screen.getByText("a.txt")).not.toBeNull();
    expect(screen.getByText("c.txt")).not.toBeNull();
    expect(screen.getByText(/No text in b/)).not.toBeNull();
  });

  it("shows inline conversation errors; Retry re-sends without duplicating the turn", async () => {
    authorMock
      .mockRejectedValueOnce({ kind: "http", status: 429, message: "Too Many Requests", raw: {} })
      .mockResolvedValue({ markdown: CANDIDATE, reply: "Recovered", valid: true, diagnostics: [] });
    renderChat();
    await sendInstruction("Add a question");

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("busy"),
    );
    expect(screen.getByText("Add a question")).not.toBeNull();

    const firstCall = authorMock.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(authorMock).toHaveBeenCalledTimes(2));
    expect(authorMock.mock.calls[1][1]).toEqual(firstCall[1]);
    await waitFor(() => expect(screen.getByText("Recovered")).not.toBeNull());
    // No duplicated user turn, no stale error row.
    expect(screen.getAllByText("Add a question").length).toBe(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("403 errors show no Retry (futile) and 401 offers Sign in", async () => {
    authorMock.mockRejectedValueOnce({
      kind: "http",
      status: 403,
      message: "Forbidden",
      raw: {},
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("not available"),
    );
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("Review opens the diff dialog with true counts and both layouts", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" })).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const dialog = await waitFor(() =>
      screen.getByRole("dialog", { name: "Review changes" }),
    );
    expect(dialog.textContent).toContain("+5");
    expect(dialog.textContent).toContain("-0");

    // Side-by-side layout switch renders paired rows.
    fireEvent.click(screen.getByRole("tab", { name: "Side-by-side" }));
    expect(screen.getByText("Question 2 [SINGLE_CHOICE]: 3 + 3?")).not.toBeNull();

    // Inspecting the diff never mutated the editor.
    expect(mirror().value).toBe(CANDIDATE);

    // ESC closes.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Review changes" })).toBeNull(),
    );
  });

  it("shows an honest no-changes state in the diff dialog", async () => {
    authorMock.mockResolvedValue({
      markdown: SOURCE,
      reply: "No changes needed",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Improve this");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Review" })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(screen.getByTestId("ai-diff-no-changes")).not.toBeNull(),
    );
  });

  it("sources manager supports search, detach and removal", async () => {
    extractMock.mockImplementation(async (_bankId: number, file: File) => ({
      name: file.name,
      text: `text of ${file.name}`,
      truncated: false,
      charCount: 20,
    }));
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: {
        files: [
          new File(["a"], "alpha.txt", { type: "text/plain" }),
          new File(["b"], "beta.txt", { type: "text/plain" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /2 sources/i })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /2 sources/i }));

    // Search narrows the list.
    fireEvent.change(screen.getByLabelText("Search sources"), {
      target: { value: "alpha" },
    });
    expect(screen.getByText("alpha.txt")).not.toBeNull();
    expect(screen.queryByText("beta.txt")).toBeNull();

    fireEvent.change(screen.getByLabelText("Search sources"), { target: { value: "" } });

    // Detach (uncheck) one source.
    fireEvent.click(screen.getByLabelText("Attach beta.txt"));
    expect(
      (screen.getByLabelText("Attach beta.txt") as HTMLInputElement).checked,
    ).toBe(false);

    // Remove the other.
    fireEvent.click(screen.getByRole("button", { name: "Remove alpha.txt" }));
    await waitFor(() => expect(screen.queryByText("alpha.txt")).toBeNull());
  });

  it("caps auto-attachment at the backend budgets (5 docs / 100k chars)", async () => {
    extractMock.mockImplementation(async (_bankId: number, file: File) => ({
      name: file.name,
      text: "x".repeat(30_000),
      truncated: false,
      charCount: 30_000,
    }));
    renderChat();
    await waitFor(() => expect(uploadButton().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: {
        files: Array.from(
          { length: 6 },
          (_, i) => new File(["x"], `f${i}.txt`, { type: "text/plain" }),
        ),
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /6 sources/i })).not.toBeNull(),
    );

    // 30k chars each: the 100k total-char budget caps attachment at 3 docs
    // (90k); the remaining 3 stay ready but unattached. Send stays available
    // with an honest selection, and no request is issued.
    fireEvent.click(screen.getByRole("button", { name: /6 sources/i }));
    await waitFor(() => {
      const checked = screen
        .getAllByRole("checkbox")
        .filter((c) => (c as HTMLInputElement).checked);
      expect(checked.length).toBe(3);
    });
    expect(authorMock).not.toHaveBeenCalled();
  });
});

describe("AiAuthoringChat review regressions", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    statusMock.mockReset();
    statusMock.mockResolvedValue({ enabled: true, available: true, model: "test-model" });
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

  /** Review P2 #3: retry after a successful intervening turn must NOT
   *  auto-apply against the newer baseline. */
  it("marks a retried stale request as conflict instead of silently overwriting", async () => {
    // Turn A fails.
    authorMock.mockRejectedValueOnce({
      kind: "http",
      status: 503,
      message: "Service Unavailable",
      raw: {},
    });
    renderChat();
    await waitFor(() => expect(composer().disabled).toBe(false));
    fireEvent.change(composer(), { target: { value: "turn A" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("alert")).not.toBeNull());

    // Turn B succeeds and auto-applies.
    authorMock.mockResolvedValueOnce({
      markdown: CANDIDATE,
      reply: "Turn B done",
      valid: true,
      diagnostics: [],
    });
    fireEvent.change(composer(), { target: { value: "turn B" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByText("Turn B done")).not.toBeNull());
    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE),
    );

    // Retry turn A: its baseline (SOURCE) differs from the editor (CANDIDATE)
    // -> conflict, never a silent auto-apply.
    authorMock.mockResolvedValueOnce({
      markdown: `${SOURCE}Question 77 [SINGLE_CHOICE]: from A?\n*A. x\nB. y\nC. z\nD. w\n`,
      reply: "Turn A recovered",
      valid: true,
      diagnostics: [],
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("Turn A recovered")).not.toBeNull());
    expect(screen.getByText(/Editor changed — review required/i)).not.toBeNull();
    // Editor still holds turn B's kept candidate.
    expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE);
  });

  /** Review P2 #4: the diff dialog's Undo all must not bypass the
   *  manual-edits confirmation. */
  it("disables dialog Undo all when manual edits followed the pending apply", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await waitFor(() => expect(composer().disabled).toBe(false));
    fireEvent.change(composer(), { target: { value: "go" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value).toBe(CANDIDATE),
    );

    // Manual edit after the pending apply.
    fireEvent.change(screen.getByLabelText("Editor mirror"), {
      target: { value: `${CANDIDATE}Question 30 [SINGLE_CHOICE]: manual?\n*A. a\nB. b\nC. c\nD. d\n` },
    });

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Review changes" })).not.toBeNull(),
    );
    const undo = screen
      .getAllByRole("button", { name: "Undo all" })
      .find((b) => b.closest('[role="dialog"]')) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    // Manual edits survive.
    expect(
      (screen.getByLabelText("Editor mirror") as HTMLTextAreaElement).value,
    ).toContain("manual?");
  });

  /** Review P2 #5: selection beyond the document cap is refused at toggle. */
  it("refuses attaching a 6th source (backend max 5)", async () => {
    extractMock.mockImplementation(async (_bankId: number, file: File) => ({
      name: file.name,
      text: "x".repeat(100),
      truncated: false,
      charCount: 100,
    }));
    renderChat();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Upload document" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Upload document (file input)"), {
      target: {
        files: Array.from({ length: 6 }, (_, i) =>
          new File(["x"], `f${i}.txt`, { type: "text/plain" }),
        ),
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /6 sources/i })).not.toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: /6 sources/i }));
    // First 5 attach (auto-selected on success); the 6th refuses to attach.
    const checked = screen
      .getAllByRole("checkbox")
      .filter((c) => (c as HTMLInputElement).checked);
    expect(checked.length).toBe(5);
    const unchecked = screen
      .getAllByRole("checkbox")
      .find((c) => !(c as HTMLInputElement).checked) as HTMLInputElement;
    fireEvent.click(unchecked);
    expect(unchecked.checked).toBe(false);
  });
});
