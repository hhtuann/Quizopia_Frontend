// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  type RenderResult,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { QuizPreviewQuestion } from "@/lib/quiz-markdown";
import { QuizMarkdownPreview } from "./quiz-markdown-preview";

afterEach(cleanup);

const singleChoice =
  "Câu 1 [SINGLE_CHOICE]: 2 + 2 bằng bao nhiêu?\n*A. 3\nB. 4\nC. 5\nD. 6";

function setup(initial: string, readOnly = false) {
  const onChange = vi.fn();
  const onDiagnosticSelect = vi.fn();
  const onQuestionSelect = vi.fn();
  const view = render(
    <ControlledPreview
      initial={initial}
      onChange={onChange}
      onDiagnosticSelect={onDiagnosticSelect}
      onQuestionSelect={onQuestionSelect}
      readOnly={readOnly}
    />,
  );
  return { onChange, onDiagnosticSelect, onQuestionSelect, view };
}

function ControlledPreview({
  initial,
  onChange,
  onDiagnosticSelect,
  onQuestionSelect,
  readOnly,
}: {
  readonly initial: string;
  readonly onChange: ReturnType<typeof vi.fn>;
  readonly onDiagnosticSelect: ReturnType<typeof vi.fn>;
  readonly onQuestionSelect: ReturnType<typeof vi.fn>;
  readonly readOnly: boolean;
}) {
  const [source, setSource] = useState(initial);
  return (
    <QuizMarkdownPreview
      onChange={
        readOnly
          ? undefined
          : (next) => {
              onChange(next);
              setSource(next);
            }
      }
      onDiagnosticSelect={onDiagnosticSelect}
      onQuestionSelect={onQuestionSelect}
      readOnly={readOnly}
      source={source}
    />
  );
}

function optionButton(view: RenderResult, label: string) {
  return view.getAllByRole("button").find(
    (button) =>
      button.getAttribute("aria-label")?.startsWith(`${label}. `) === true,
  );
}

describe("QuizMarkdownPreview", () => {
  it("renders all four question types with authoring-visible answers", () => {
    const source = [
      singleChoice,
      "Lời giải: 2 + 2 = 4",
      "Câu 2 [MULTIPLE_CHOICE]: Chọn số nguyên tố.",
      "*A. 2",
      "B. 4",
      "*C. 5",
      "D. 9",
      "Câu 3 [TRUE_FALSE_MATRIX]: Đúng hay sai?",
      "*A. HTTP thuộc tầng Application.",
      "B. TCP thuộc tầng Application.",
      "C. C",
      "D. D",
      "Câu 4 [NUMERIC_FILL]: 10 / 4 (2 chữ số thập phân)?",
      "Đáp án: 2.50",
      "Lời giải: `10 / 4 = 2.5`.",
    ].join("\n");
    const { view } = setup(source);

    const articles = view.container.querySelectorAll("article");
    expect(articles).toHaveLength(4);

    expect(view.getAllByText("Single choice")).toHaveLength(1);
    expect(view.getAllByText("Multiple choice")).toHaveLength(1);
    expect(view.getAllByText("True / False")).toHaveLength(1);
    expect(view.getAllByText("Numeric fill")).toHaveLength(1);

    // Correct-answer pills visible to the author.
    expect(view.getAllByText("correct").length).toBe(3);
    expect(view.getAllByText("True").length).toBe(1);
    expect(view.getAllByText("False").length).toBe(3);
    expect(view.getByText("2.50")).not.toBeNull();
    expect(view.getAllByText("Lời giải").length).toBeGreaterThan(0);
  });

  it("moves the sole star for SINGLE_CHOICE without touching anything else", () => {
    const { onChange, view } = setup(singleChoice);
    const target = optionButton(view, "B");
    expect(target).toBeDefined();
    fireEvent.click(target!);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      "Câu 1 [SINGLE_CHOICE]: 2 + 2 bằng bao nhiêu?\nA. 3\n*B. 4\nC. 5\nD. 6",
    );
  });

  it("toggles a star for MULTIPLE_CHOICE", () => {
    const source =
      "Câu 1 [MULTIPLE_CHOICE]: Chọn.\n*A. 1\nB. 2\nC. 3\nD. 4";
    const { onChange, view } = setup(source);
    fireEvent.click(optionButton(view, "A")!);
    expect(onChange).toHaveBeenCalledWith(
      "Câu 1 [MULTIPLE_CHOICE]: Chọn.\nA. 1\nB. 2\nC. 3\nD. 4",
    );

    fireEvent.click(optionButton(view, "D")!);
    expect(onChange).toHaveBeenLastCalledWith(
      "Câu 1 [MULTIPLE_CHOICE]: Chọn.\nA. 1\nB. 2\nC. 3\n*D. 4",
    );
  });

  it("toggles TRUE/FALSE state for TRUE_FALSE_MATRIX", () => {
    const source =
      "Câu 1 [TRUE_FALSE_MATRIX]: Đánh dấu.\nA. một\nB. hai\nC. ba\nD. bốn";
    const { onChange, view } = setup(source);
    fireEvent.click(optionButton(view, "C")!);
    expect(onChange).toHaveBeenCalledWith(
      "Câu 1 [TRUE_FALSE_MATRIX]: Đánh dấu.\nA. một\nB. hai\n*C. ba\nD. bốn",
    );
  });

  it("preserves CRLF and unrelated formatting when toggling", () => {
    const source =
      "Câu 1 [SINGLE_CHOICE]: stem\r\n*A. first\r\ncontinued\r\nB. second\r\nC. third\r\nD. fourth\r\n\r\nLời giải: keep  two spaces";
    const { onChange, view } = setup(source);
    fireEvent.click(optionButton(view, "B")!);
    expect(onChange).toHaveBeenCalledWith(
      "Câu 1 [SINGLE_CHOICE]: stem\r\nA. first\r\ncontinued\r\n*B. second\r\nC. third\r\nD. fourth\r\n\r\nLời giải: keep  two spaces",
    );
  });

  it("offers no option interaction for NUMERIC_FILL", () => {
    const source =
      "Câu 1 [NUMERIC_FILL]: value?\nĐáp án: 1234\nLời giải: why";
    const { onChange, view } = setup(source);
    const optionButtons = view
      .getAllByRole("button")
      .filter((button) => /^[[A-D]\. /.test(button.getAttribute("aria-label") ?? ""));
    expect(optionButtons).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("navigates to a question source location when its header is clicked", () => {
    const source = `${singleChoice}\nCâu 2 [NUMERIC_FILL]: value?\nĐáp án: 1234`;
    const { onQuestionSelect, view } = setup(source);
    fireEvent.click(view.getByRole("button", { name: /question 2, line 6/ }));

    expect(onQuestionSelect).toHaveBeenCalledTimes(1);
    const question = onQuestionSelect.mock
      .calls[0][0] as QuizPreviewQuestion;
    expect(question.number).toBe(2);
    expect(question.source.offset).toBe(source.indexOf("Câu 2"));
  });

  it("navigates to a diagnostic line and column when clicked", () => {
    const { onDiagnosticSelect, view } = setup("Câu 1 [bogus]: stem\n");
    const diagnosticButton = view
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("UNKNOWN_QUESTION_TYPE"));
    expect(diagnosticButton).toBeDefined();
    fireEvent.click(diagnosticButton!);
    expect(onDiagnosticSelect).toHaveBeenCalledWith(1, 8);
  });

  it("renders read-only without interactive toggles", () => {
    const { view } = setup(singleChoice, true);
    expect(
      view.queryAllByRole("button").filter((button) =>
        button.getAttribute("aria-label")?.match(/^[A-D]\. /),
      ),
    ).toHaveLength(0);
    expect(view.container.querySelectorAll('[aria-pressed]')).toHaveLength(0);
  });

  it("shows the empty state for source without questions", () => {
    const { view } = setup("just some prose");
    expect(view.getByText(/Start a question with/)).not.toBeNull();
  });
});
