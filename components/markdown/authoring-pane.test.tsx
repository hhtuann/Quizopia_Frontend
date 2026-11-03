// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizMarkdownAuthoringPane } from "./authoring-pane";

afterEach(cleanup);

const sample = [
  "Câu 1 [SINGLE_CHOICE]: Giao thức tầng Application?",
  "*A. HTTP",
  "B. TCP",
  "C. IP",
  "D. UDP",
  "Câu 2 [NUMERIC_FILL]: 10 / 4 (2 chữ số thập phân)?",
  "Đáp án: 2.50",
].join("\n");

function setup(value: string) {
  const onChange = vi.fn();
  const view = render(
    <QuizMarkdownAuthoringPane onChange={onChange} value={value} />,
  );
  return { onChange, view };
}

describe("QuizMarkdownAuthoringPane", () => {
  it("renders editor and preview panes with the switch controls", () => {
    const { view } = setup(sample);
    expect(view.getByLabelText("Quiz Markdown source")).not.toBeNull();
    expect(view.getByText("Câu 1")).not.toBeNull();
    expect(view.getByRole("button", { name: "Editor" })).not.toBeNull();
    expect(view.getByRole("button", { name: "Preview" })).not.toBeNull();
  });

  it("switches panes on small screens while keeping both mounted", () => {
    const { view } = setup(sample);
    const editorPane = view.getByLabelText("Quiz Markdown source").closest(
      "div.grid > div",
    );
    const previewPane = view
      .getByText("Single choice")
      .closest("div.grid > div");
    expect(editorPane).not.toBeNull();
    expect(previewPane).not.toBeNull();

    // Default: editor visible, preview hidden (mobile).
    expect(previewPane?.className).toContain("hidden");

    fireEvent.click(view.getByRole("button", { name: "Preview" }));
    expect(editorPane?.className).toContain("hidden");
    expect(previewPane?.className).not.toContain("hidden");

    // Source and caret survive: textarea is still mounted with its value.
    const textarea = view.getByLabelText(
      "Quiz Markdown source",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe(sample);

    fireEvent.click(view.getByRole("button", { name: "Editor" }));
    expect(editorPane?.className).not.toContain("hidden");
    expect(previewPane?.className).toContain("hidden");
  });

  it("navigates the caret to a diagnostic location when its list item is clicked", () => {
    const broken = "Câu 1 [bogus]: stem\n*A. a\nB. b\nC. c\nD. d";
    const { view } = setup(broken);
    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    const diagnosticButton = view
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("UNKNOWN_QUESTION_TYPE"));
    expect(diagnosticButton).toBeDefined();
    fireEvent.click(diagnosticButton!);

    const textarea = view.getByLabelText(
      "Quiz Markdown source",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    // UNKNOWN_QUESTION_TYPE for Câu 1 points at column 8 → offset 7.
    expect(textarea.selectionStart).toBe(7);
  });

  it("navigates the caret to a question source when its card header is clicked", () => {
    const { view } = setup(sample);
    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    fireEvent.click(
      view.getByRole("button", { name: /question 2, line 6/ }),
    );
    const textarea = view.getByLabelText(
      "Quiz Markdown source",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(sample.indexOf("Câu 2"));
  });
});
