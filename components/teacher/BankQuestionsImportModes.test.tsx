// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BankQuestionsPage from "@/app/(teacher)/question-banks/[bankId]/page";

vi.mock("next/navigation", () => ({
  useParams: () => ({ bankId: "5" }),
}));

vi.mock("@/hooks/queries/use-question-banks", () => ({
  useBankQuestionsQuery: () => ({
    data: { items: [], page: 0, size: 10, totalElements: 0, totalPages: 0, sort: "" },
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("@/lib/api/question-import", () => ({
  importMarkdownQuestions: vi.fn(),
}));

/**
 * P2-C (issue #18): the Teacher bank detail offers two coexisting import
 * paths — the existing Excel Import and the new Markdown Authoring — behind a
 * segmented control, and switching must not lose an in-progress Markdown
 * draft (both panels stay mounted).
 */
describe("bank question page import modes", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(cleanup);

  function renderPage() {
    return render(
      <QueryClientProvider client={queryClient}>
        <BankQuestionsPage />
      </QueryClientProvider>
    );
  }

  it("shows both import methods in a segmented control", () => {
    renderPage();

    const group = screen.getByRole("group", { name: "Import method" });
    expect(group).not.toBeNull();
    expect(screen.getByRole("button", { name: "Excel Import" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Markdown Authoring" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("Excel Import panel is the default and Markdown is hidden", () => {
    renderPage();

    expect(screen.queryByLabelText("Choose an .xlsx workbook to import")).not.toBeNull();
    const markdownTextarea = screen.getByLabelText("Quiz Markdown source");
    expect(markdownTextarea.closest("div.hidden")).not.toBeNull();
  });

  it("switching to Markdown shows the authoring pane and keeps the draft on switch back", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Markdown Authoring" }));
    expect(
      screen.getByRole("button", { name: "Markdown Authoring" }).getAttribute("aria-pressed")
    ).toBe("true");

    const textarea = screen.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement;
    expect(textarea.closest("div.hidden")).toBeNull();
    fireEvent.change(textarea, {
      target: { value: "Câu 1 [NUMERIC_FILL]: draft?\nĐáp án: 1.25\n" },
    });

    // Switch away and back — the draft survives (panel stays mounted, hidden).
    fireEvent.click(screen.getByRole("button", { name: "Excel Import" }));
    expect(screen.getByLabelText("Quiz Markdown source").closest("div.hidden")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Markdown Authoring" }));
    expect(
      (screen.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement).value
    ).toContain("Đáp án: 1.25");
  });
});
