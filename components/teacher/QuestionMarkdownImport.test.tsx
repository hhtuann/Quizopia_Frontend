// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionMarkdownImport } from "./QuestionMarkdownImport";
import { importMarkdownQuestions } from "@/lib/api/question-import";
import type { ImportResponse } from "@/lib/api/question-import";

vi.mock("@/lib/api/question-import", () => ({
  importMarkdownQuestions: vi.fn(),
}));

const importMock = vi.mocked(importMarkdownQuestions);

const VALID_DOC = `Câu 1 [SINGLE_CHOICE]: 2 + 2?
*A. 4
B. 3
C. 5
D. 6
`;

const MULTIPLE_ONE_STAR = `Câu 1 [MULTIPLE_CHOICE]: one star only.
*A. one
B. two
C. three
D. four
`;

const LEADING_DOT = `Câu 1 [NUMERIC_FILL]: value?
Đáp án: -.50
`;

function okResponse(n: number): ImportResponse {
  return { totalRows: n, importedRows: n, invalidRows: 0, errors: [] };
}

describe("QuestionMarkdownImport", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    importMock.mockReset();
  });

  afterEach(cleanup);

  function renderComponent(bankId = 7) {
    return render(
      <QueryClientProvider client={queryClient}>
        <QuestionMarkdownImport bankId={bankId} />
      </QueryClientProvider>
    );
  }

  function editor() {
    return screen.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement;
  }

  function confirmButton() {
    return screen.getByRole("button", { name: /^Confirm adding/ }) as HTMLButtonElement;
  }

  it("enables the explicit confirm for a conformant document and calls the API", async () => {
    importMock.mockResolvedValue(okResponse(1));
    renderComponent();

    fireEvent.change(editor(), { target: { value: VALID_DOC } });

    const confirm = confirmButton();
    expect(confirm.disabled).toBe(false);
    expect(confirm.textContent).toContain("Add 1 question");

    fireEvent.click(confirm);
    await waitFor(() => expect(importMock).toHaveBeenCalledWith(7, VALID_DOC));

    // Success keeps the panel mounted, clears the editor, folds the pane and
    // shows the banner inline (no result view / "Write another" round-trip).
    const banner = await waitFor(() => {
      const el = document.querySelector('section[aria-label="Markdown import"] [role="status"]');
      expect(el?.textContent).toContain("Added all 1 questions to this bank.");
      return el;
    });
    expect(banner).not.toBeNull();
    await waitFor(() => expect((screen.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement).value).toBe(""));
    expect(screen.getByRole("button", { name: /Write questions|Collapse/ }).textContent).toContain("Write questions");
    expect(screen.queryByRole("button", { name: "Write another" })).toBeNull();
  });

  it("disables confirm and shows the violation for a single-correct MULTIPLE_CHOICE", () => {
    renderComponent();

    fireEvent.change(editor(), { target: { value: MULTIPLE_ONE_STAR } });

    expect(confirmButton().disabled).toBe(true);
    const violation = screen.getAllByTestId("bank-contract-violation")[0];
    expect(violation.textContent).toContain("MULTIPLE_CHOICE_MIN_TWO_CORRECT");
    expect(violation.textContent).toContain("at least 2 correct");
  });

  it("disables confirm and shows the canonical suggestion for -.50", () => {
    renderComponent();

    fireEvent.change(editor(), { target: { value: LEADING_DOT } });

    expect(confirmButton().disabled).toBe(true);
    const violation = screen.getAllByTestId("bank-contract-violation")[0];
    expect(violation.textContent).toContain("NUMERIC_ANSWER_BANK_CONTRACT");
    expect(violation.textContent).toContain("-0.5");
    expect(violation.textContent).toContain("never rewritten");
  });

  it("disables confirm while grammar diagnostics are present", () => {
    renderComponent();

    fireEvent.change(editor(), {
      target: {
        value: "This is not a quiz markdown document at all.\nRandom content.\n",
      },
    });

    expect(confirmButton().disabled).toBe(true);
  });

  it("never calls the API while a violation blocks the confirm", () => {
    renderComponent();
    fireEvent.change(editor(), { target: { value: MULTIPLE_ONE_STAR } });
    expect(confirmButton().disabled).toBe(true);
    expect(importMock).not.toHaveBeenCalled();
  });

  it("maps a hard API error to an inline alert", async () => {
    importMock.mockRejectedValue({
      kind: "api",
      code: "QUESTION_IMPORT_MARKDOWN_TOO_LARGE",
      status: 413,
      message: "too large",
    });
    renderComponent();
    fireEvent.change(editor(), { target: { value: VALID_DOC } });
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("max 256 KB");
  });

  it("shows a nothing-imported result for an atomic server rejection", async () => {
    importMock.mockResolvedValue({
      totalRows: 1,
      importedRows: 0,
      invalidRows: 1,
      errors: [
        {
          rowNumber: 1,
          questionCode: null,
          field: "correctAnswers",
          code: "MULTIPLE_CHOICE_MIN_TWO_CORRECT",
          message: "Question 1: MULTIPLE_CHOICE requires at least 2 correct options",
          line: null,
          column: null,
        },
      ],
    });
    renderComponent();
    fireEvent.change(editor(), { target: { value: VALID_DOC } });
    fireEvent.click(confirmButton());

    expect(await screen.findByText(/Nothing was imported/)).not.toBeNull();
    expect(screen.getByText("MULTIPLE_CHOICE_MIN_TWO_CORRECT")).not.toBeNull();
  });

  it("shows authoritative parser source coordinates in the rejection table", async () => {
    importMock.mockResolvedValue({
      totalRows: 0,
      importedRows: 0,
      invalidRows: 1,
      errors: [
        {
          rowNumber: 1,
          questionCode: null,
          field: null,
          code: "NUMERIC_ANSWER_INVALID",
          message: "Invalid numeric answer token",
          line: 2,
          column: 11,
        },
      ],
    });
    renderComponent();
    fireEvent.change(editor(), { target: { value: VALID_DOC } });
    fireEvent.click(confirmButton());

    expect(await screen.findByText(/Nothing was imported/)).not.toBeNull();
    expect(screen.getByText("L2:C11")).not.toBeNull();
  });

  it("shows an em dash for contract errors without source coordinates", async () => {
    importMock.mockResolvedValue({
      totalRows: 1,
      importedRows: 0,
      invalidRows: 1,
      errors: [
        {
          rowNumber: 2,
          questionCode: null,
          field: "correctAnswers",
          code: "MULTIPLE_CHOICE_MIN_TWO_CORRECT",
          message: "Question 2: MULTIPLE_CHOICE requires at least 2 correct options",
          line: null,
          column: null,
        },
      ],
    });
    renderComponent();
    fireEvent.change(editor(), { target: { value: VALID_DOC } });
    fireEvent.click(confirmButton());

    expect(await screen.findByText(/Nothing was imported/)).not.toBeNull();
    const sourceCells = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => (row as HTMLTableRowElement).cells?.[1]?.textContent);
    expect(sourceCells).toEqual(["—"]);
  });

  it("invalidates the bank question cache after a successful import", async () => {
    importMock.mockResolvedValue(okResponse(1));
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderComponent();

    fireEvent.change(editor(), { target: { value: VALID_DOC } });
    fireEvent.click(confirmButton());
    await waitFor(() => expect(importMock).toHaveBeenCalled());

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["question-banks", 7, "questions"] })
      )
    );
  });
});
