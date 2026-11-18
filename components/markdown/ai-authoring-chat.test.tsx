// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
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
let onChange: Mock;

function Harness({ start }: { start: string }) {
  const [value, setValue] = useState(start);
  return (
    <>
      <textarea
        aria-label="Editor mirror"
        onChange={(event) => setValue(event.target.value)}
        value={value}
      />
      <AiAuthoringChat
        bankId={7}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        value={value}
      />
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
    onChange = vi.fn();
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

  function instructionBox() {
    return screen.getByLabelText("Instruction") as HTMLTextAreaElement;
  }

  function sendButton() {
    return screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
  }

  function uploadButton() {
    return screen.getByRole("button", { name: "Upload document" }) as HTMLButtonElement;
  }
  async function sendInstruction(text: string) {
    // Wait for the status probe, type, then for Send to enable on non-empty.
    await waitFor(() => expect(instructionBox().disabled).toBe(false));
    fireEvent.change(instructionBox(), { target: { value: text } });
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
    expect(instructionBox().disabled).toBe(true);
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

  it("uploads a document as multipart part 'file' and shows a chip", async () => {
    extractMock.mockResolvedValue({
      name: "notes.txt",
      text: "extracted text",
      truncated: false,
      charCount: 5,
    });
    renderChat();
    await waitFor(() =>
      expect(uploadButton().disabled).toBe(false),
    );

    const file = new File(["raw"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(extractMock).toHaveBeenCalledTimes(1));
    expect(extractMock.mock.calls[0][0]).toBe(7);
    expect(extractMock.mock.calls[0][1]).toBe(file);

    await waitFor(() => expect(screen.getByText(/notes\.txt \(5 chars\)/)).not.toBeNull());
  });

  it("rejects files over 5 MiB client-side without calling the API", async () => {
    renderChat();
    await waitFor(() =>
      expect(uploadButton().disabled).toBe(false),
    );

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf");
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: { files: [big] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("larger than 5 MiB"),
    );
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("shows the normalized extraction failure inline", async () => {
    extractMock.mockRejectedValue({
      kind: "api",
      status: 422,
      code: "AI_DOCUMENT_UNREADABLE",
      message: "Could not read the document",
      raw: {},
    });
    renderChat();
    await waitFor(() =>
      expect(uploadButton().disabled).toBe(false),
    );

    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: { files: [new File(["raw"], "broken.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Could not read the document"),
    );
  });

  it("sends instruction, current markdown, documents and prior history; pending disables send", async () => {
    extractMock.mockResolvedValue({
      name: "notes.txt",
      text: "extracted text",
      truncated: false,
      charCount: 5,
    });
    renderChat();
    await waitFor(() =>
      expect(uploadButton().disabled).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: { files: [new File(["raw"], "notes.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(screen.getByText(/notes\.txt \(5 chars\)/)).not.toBeNull());
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
    // Pending request disables the send button.
    await waitFor(() => expect(sendButton().disabled).toBe(true));

    resolveFirst({ markdown: CANDIDATE, reply: "Done", valid: true, diagnostics: [] });
    await waitFor(() => expect(screen.getByText("Done")).not.toBeNull());

    // Second turn carries the prior exchange as history.
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

  it("applies the candidate and undoes back to the pre-apply editor source", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");

    await waitFor(() => expect(screen.getByText("Here is your question")).not.toBeNull());
    expect(screen.getByText("Valid Quiz Markdown")).not.toBeNull();
    expect(screen.getByText(/Question 2 \[SINGLE_CHOICE\]: 3 \+ 3\?/)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Apply to editor" }));
    expect(onChange).toHaveBeenCalledWith(CANDIDATE);
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange).toHaveBeenLastCalledWith(SOURCE);
    await waitFor(() => expect(mirror().value).toBe(SOURCE));
  });

  /** Gate review P1: Undo must not silently delete post-Apply manual edits. */
  it("asks before Undo when the teacher edited after Apply, then restores", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() => expect(screen.getByText("Here is your question")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Apply to editor" }));
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    // Manual edit AFTER Apply must not be silently destroyed by Undo.
    const MANUAL = `${CANDIDATE}Question 30 [SINGLE_CHOICE]: manual edit?
`;
    fireEvent.change(mirror(), { target: { value: MANUAL } });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByText(/editor changed since you applied this candidate/i),
    ).not.toBeNull();
    // Nothing overwritten yet — the manual edit survives until confirmation.
    expect(mirror().value).toBe(MANUAL);

    fireEvent.click(screen.getByRole("button", { name: "Restore anyway" }));
    expect(onChange).toHaveBeenLastCalledWith(SOURCE);
    await waitFor(() => expect(mirror().value).toBe(SOURCE));
  });

  it("undoes immediately (no prompt) when nothing was edited after Apply", async () => {
    authorMock.mockResolvedValue({
      markdown: CANDIDATE,
      reply: "Here is your question",
      valid: true,
      diagnostics: [],
    });
    renderChat();
    await sendInstruction("Add a question");
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply to editor" })).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Apply to editor" }));
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mirror().value).toBe(SOURCE));
    expect(screen.queryByText(/editor changed since you applied/i)).toBeNull();
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

    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [
          new File(["a"], "a.txt", { type: "text/plain" }),
          new File(["b"], "b.txt", { type: "text/plain" }),
          new File(["c"], "c.txt", { type: "text/plain" }),
        ],
      },
    });

    await waitFor(() => expect(extractMock).toHaveBeenCalledTimes(3));
    // Both successful documents are attached, in selection order.
    await waitFor(() => expect(screen.getByText(/a\.txt/)).not.toBeNull());
    expect(screen.getByText(/c\.txt/)).not.toBeNull();
    // The failed one is reported but does not drop the others.
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("No text in b"),
    );
  });

  it("asks for confirmation when the editor changed since the request, then applies anyway", async () => {
    const { promise: authorPromise, resolve: resolveAuthor } =
      Promise.withResolvers<AiAuthorResponse>();
    authorMock.mockImplementation(() => authorPromise);
    renderChat();
    await sendInstruction("Add a question");

    // The user edits the editor while the assistant is working.
    const EDITED = `${SOURCE}Question 9 [TRUE_FALSE]: edited?
`;
    fireEvent.change(mirror(), { target: { value: EDITED } });

    resolveAuthor({
      markdown: CANDIDATE,
      reply: "Here you go",
      valid: true,
      diagnostics: [],
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Apply to editor" })).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Apply to editor" }));
    expect(
      screen.getByText("The editor changed since this request. Apply anyway?"),
    ).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply anyway" }));
    expect(onChange).toHaveBeenCalledWith(CANDIDATE);
    await waitFor(() => expect(mirror().value).toBe(CANDIDATE));

    // Undo restores the value at apply time (the edited source), not the
    // original request-time source.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mirror().value).toBe(EDITED));
  });

  it("shows the error banner and Retry re-sends the same request without duplicating the turn", async () => {
    authorMock
      .mockRejectedValueOnce({ kind: "http", status: 429, message: "Too Many Requests", raw: {} })
      .mockResolvedValue({ markdown: CANDIDATE, reply: "Recovered", valid: true, diagnostics: [] });
    renderChat();
    await sendInstruction("Add a question");

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("busy"));
    // The failed turn stays in the conversation log.
    expect(screen.getByText("Add a question")).not.toBeNull();

    const firstCall = authorMock.mock.calls[0];
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(authorMock).toHaveBeenCalledTimes(2));
    expect(authorMock.mock.calls[1][1]).toEqual(firstCall[1]);
    await waitFor(() => expect(screen.getByText("Recovered")).not.toBeNull());
    expect(screen.getAllByText("Add a question").length).toBe(1);
  });

  it("shows diagnostics for an invalid candidate and still allows applying", async () => {
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
    expect(screen.getByText("Invalid — diagnostics below")).not.toBeNull();
    const diagnostic = screen.getByText(/Question type missing/).closest("li");
    expect(diagnostic?.textContent).toContain("QUIZ_MD_MISSING_TYPE");

    const apply = screen.getByRole("button", { name: "Apply to editor" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("garbage"));
  });
});
