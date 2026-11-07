// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  QuizMarkdownCodeEditor,
  type QuizMarkdownCodeEditorHandle,
} from "./quiz-markdown-code-editor";

afterEach(cleanup);

function EditorHarness({ initial }: { readonly initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <output data-testid="exact-editor-value">{value}</output>
      <QuizMarkdownCodeEditor onChange={setValue} value={value} />
    </>
  );
}

function ProgrammaticFocusHarness({
  focusOffset,
  initial,
}: {
  readonly focusOffset?: number;
  readonly initial: string;
}) {
  const [value, setValue] = useState(initial);
  const editorRef = useRef<QuizMarkdownCodeEditorHandle>(null);
  return (
    <>
      <button
        onClick={() =>
          editorRef.current?.focusOffset(focusOffset ?? value.length, {
            suppressAutocomplete: true,
          })
        }
        type="button"
      >
        Focus without completion
      </button>
      <QuizMarkdownCodeEditor
        onChange={setValue}
        ref={editorRef}
        value={value}
      />
    </>
  );
}

function editorElement() {
  return screen.getByLabelText<HTMLTextAreaElement>("Quiz Markdown source");
}

function composingKeyDown(target: HTMLElement, key: string) {
  // Simulate a key event fired while an IME composition is active.
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "isComposing", { value: true });
  target.dispatchEvent(event);
}

describe("QuizMarkdownCodeEditor", () => {
  it("renders synchronized line numbers and updates the active caret line", () => {
    render(<EditorHarness initial={"first\nsecond\nthird"} />);
    const editor = editorElement();

    expect(
      screen.getByTestId("quiz-markdown-line-numbers").textContent,
    ).toBe("123");
    fireEvent.select(editor, {
      target: { selectionStart: 7, selectionEnd: 7 },
    });
    expect(
      screen.getByTestId("quiz-markdown-active-line").getAttribute("style"),
    ).toContain("top: 36px");
  });

  it("highlights structural tokens while keeping the textarea source exact", () => {
    const source =
      "Câu 1 [SINGLE_CHOICE]: stem\n*A. correct\nB. other\nC. third\nD. fourth\nLời giải: detail";
    render(<EditorHarness initial={source} />);

    const layer = screen.getByTestId("quiz-markdown-highlight-layer");
    expect(editorElement().value).toBe(source);
    expect(
      layer.querySelectorAll('span[class*="0052FF"], span[class*="4D7CFF"]')
        .length,
    ).toBeGreaterThan(3);
    expect(layer.textContent).toContain("SINGLE_CHOICE");
    expect(layer.textContent).toContain("Lời giải:");
  });

  it("does not highlight structural-looking fenced code as quiz structure", () => {
    render(
      <EditorHarness
        initial={"Câu 1 [SINGLE_CHOICE]: code\n```text\n*A. fake\n```\n*A. real"}
      />,
    );
    const layer = screen.getByTestId("quiz-markdown-highlight-layer");
    const fakeLine = Array.from(layer.querySelectorAll("span")).find(
      (node) => node.textContent === "*A. fake",
    );
    expect(fakeLine?.getAttribute("class")).toContain("64748B");
  });

  it("accepts lowercase completion with keyboard and inserts canonical syntax", () => {
    render(<EditorHarness initial="câu" />);
    const editor = editorElement();
    fireEvent.select(editor, {
      target: { selectionStart: 3, selectionEnd: 3 },
    });
    fireEvent.keyDown(editor, { key: "ArrowDown" });
    fireEvent.keyUp(editor, { key: "ArrowDown" });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor.value).toBe("Câu 1 [MULTIPLE_CHOICE]: ");
    expect(editor.selectionStart).toBe(editor.value.length);
  });

  it("accepts an active completion with Tab", () => {
    render(<EditorHarness initial="câu" />);
    const editor = editorElement();
    fireEvent.select(editor, {
      target: { selectionStart: 3, selectionEnd: 3 },
    });
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe("Câu 1 [SINGLE_CHOICE]: ");
    expect(editor.selectionStart).toBe(editor.value.length);
  });

  it("accepts a suggestion with a mouse click", () => {
    const source = "Câu 1 [SINGLE_CHOICE]: choose\n*A. a\nB. b\nC. c\nD. d\nL";
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    fireEvent.select(editor, {
      target: { selectionStart: source.length, selectionEnd: source.length },
    });
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(
      screen.getByTestId("exact-editor-value").textContent,
    ).toContain("Lời giải: ");
  });

  it("inserts an exact tab at the caret and retains editor focus", async () => {
    render(<EditorHarness initial="alpha" />);
    const editor = editorElement();
    editor.focus();
    editor.setSelectionRange(2, 2);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe("al\tpha");
    await waitFor(() => expect(editor.selectionStart).toBe(3));
    expect(editor.selectionEnd).toBe(3);
    expect(document.activeElement).toBe(editor);
  });

  it("preserves a literal tab authored inside fenced code", async () => {
    const source = "```text\nvalue\n```";
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    const caret = source.indexOf("value");
    editor.focus();
    editor.setSelectionRange(caret, caret);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(editor.value).toBe("```text\n\tvalue\n```");
    await waitFor(() => expect(editor.selectionStart).toBe(caret + 1));
    expect(document.activeElement).toBe(editor);
  });

  it("indents and outdents selected lines without changing CRLF endings", async () => {
    const source = "one\r\ntwo\r\nthree";
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    editor.focus();
    editor.setSelectionRange(0, source.length);
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(screen.getByTestId("exact-editor-value").textContent).toBe(
      "\tone\r\n\ttwo\r\n\tthree",
    );
    expect(editor.value).toBe("\tone\n\ttwo\n\tthree");

    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });
    expect(screen.getByTestId("exact-editor-value").textContent).toBe(source);
    await waitFor(() => expect(editor.selectionStart).toBe(0));
  });

  it("does not remove authored text when Shift+Tab has no leading tab", () => {
    render(<EditorHarness initial="alpha" />);
    const editor = editorElement();
    editor.focus();
    editor.setSelectionRange(3, 3);
    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });
    expect(editor.value).toBe("alpha");
    expect(document.activeElement).toBe(editor);
  });

  it("suppresses completion for programmatic navigation until real typing", () => {
    render(<ProgrammaticFocusHarness initial="câu" />);
    const editor = editorElement();

    fireEvent.click(
      screen.getByRole("button", { name: "Focus without completion" }),
    );
    expect(
      screen.queryByRole("listbox", { name: "Quiz Markdown suggestions" }),
    ).toBeNull();

    fireEvent.change(editor, {
      target: { selectionStart: 2, selectionEnd: 2, value: "câ" },
    });
    expect(
      screen.getByRole("listbox", { name: "Quiz Markdown suggestions" }),
    ).not.toBeNull();
  });

  it("hides autocomplete while a range selection touches a marker", () => {
    const source =
      "Câu 1 [MULTIPLE_CHOICE]: choose\nA. alpha\nB. Văn\nC. gamma\nD. delta";
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    const markerCaret = source.indexOf("B. Văn") + 1;

    fireEvent.select(editor, {
      target: { selectionStart: markerCaret, selectionEnd: markerCaret + 4 },
    });
    expect(
      screen.queryByRole("listbox", { name: "Quiz Markdown suggestions" }),
    ).toBeNull();

    fireEvent.select(editor, {
      target: { selectionStart: markerCaret, selectionEnd: markerCaret },
    });
    expect(
      screen.getByRole("listbox", { name: "Quiz Markdown suggestions" }),
    ).not.toBeNull();
  });

  it("replaces an existing question marker and preserves the stem exactly", async () => {
    const source = "Câu 1 [MULTIPLE_CHOICE]: Stem  with  spaces";
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    const caret = source.indexOf("MULTIPLE_CHOICE") + 4;
    editor.setSelectionRange(caret, caret);
    fireEvent.click(editor);
    fireEvent.click(
      screen.getByRole("option", { name: "Câu 1 [SINGLE_CHOICE]:" }),
    );

    const expected = "Câu 1 [SINGLE_CHOICE]: Stem  with  spaces";
    expect(editor.value).toBe(expected);
    await waitFor(() =>
      expect(editor.selectionStart).toBe(expected.indexOf(":") + 1),
    );
    expect(editor.selectionEnd).toBe(editor.selectionStart);
  });

  it.each([
    ["B. Văn", "*B.", "*B. Văn"],
    ["*B. Văn", "B.", "B. Văn"],
  ] as const)(
    "replaces only the existing option marker in %s",
    async (optionLine, selectedMarker, expectedLine) => {
      const prefix = "Câu 1 [MULTIPLE_CHOICE]: choose\nA. alpha\n";
      const source = `${prefix}${optionLine}\nC. gamma\nD. delta`;
      render(<EditorHarness initial={source} />);
      const editor = editorElement();
      const caret = prefix.length + (optionLine.startsWith("*") ? 2 : 1);
      editor.setSelectionRange(caret, caret);
      fireEvent.click(editor);
      fireEvent.click(screen.getByRole("option", { name: selectedMarker }));

      expect(editor.value).toBe(`${prefix}${expectedLine}\nC. gamma\nD. delta`);
      await waitFor(() =>
        expect(editor.selectionStart).toBe(
          prefix.length + selectedMarker.length,
        ),
      );
      expect(editor.selectionEnd).toBe(editor.selectionStart);
    },
  );

  it("supports typing Vietnamese diacritics without losing the source", () => {
    render(<EditorHarness initial="Câu 1 [NUMERIC_FILL]: Giá trị " />);
    const editor = editorElement();
    fireEvent.change(editor, {
      target: {
        selectionStart: editor.value.length,
        selectionEnd: editor.value.length,
        value: `${editor.value}của 10 / 4?`,
      },
    });
    expect(
      screen.getByTestId("exact-editor-value").textContent,
    ).toBe("Câu 1 [NUMERIC_FILL]: Giá trị của 10 / 4?");
  });
});

describe("QuizMarkdownCodeEditor IME composition safety", () => {
  it("ignores Enter while an IME composition is active", () => {
    render(<EditorHarness initial="câu" />);
    const editor = editorElement();
    fireEvent.select(editor, {
      target: { selectionStart: 3, selectionEnd: 3 },
    });
    expect(screen.getAllByRole("option").length).toBe(4);

    composingKeyDown(editor, "Enter");
    expect(editor.value).toBe("câu");
    expect(screen.getAllByRole("option").length).toBe(4);
  });

  it("ignores Tab and arrows while composing", () => {
    render(<EditorHarness initial="câu" />);
    const editor = editorElement();
    fireEvent.select(editor, {
      target: { selectionStart: 3, selectionEnd: 3 },
    });

    composingKeyDown(editor, "Tab");
    composingKeyDown(editor, "ArrowDown");
    composingKeyDown(editor, "Escape");
    expect(editor.value).toBe("câu");
    expect(screen.getAllByRole("option").length).toBe(4);
  });
});

describe("QuizMarkdownCodeEditor NUMERIC_FILL answer marker autocomplete", () => {
  const numericQuestion =
    "Câu 2 [NUMERIC_FILL]: Giá trị của 10 / 4 là bao nhiêu?";

  function caretToEnd(editor: HTMLTextAreaElement, source: string) {
    fireEvent.select(editor, {
      target: { selectionStart: source.length, selectionEnd: source.length },
    });
  }

  it("offers exactly the canonical Đáp án: marker on an empty line", () => {
    const source = `${numericQuestion}\n`;
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    caretToEnd(editor, source);

    const options = screen.getAllByRole("option");
    // Bilingual assistance: English default first, Vietnamese alias second.
    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toBe("Expected answer:");
    expect(options[1]?.textContent).toBe("Đáp án:");
  });

  it("inserts the byte-exact marker with Enter and places the caret after it", async () => {
    const source = `${numericQuestion}\n`;
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    caretToEnd(editor, source);
    fireEvent.keyDown(editor, { key: "Enter" });

    const expected = `${source}Expected answer: `;
    expect(screen.getByTestId("exact-editor-value").textContent).toBe(expected);
    await waitFor(() => expect(editor.selectionStart).toBe(expected.length));
    expect(editor.selectionEnd).toBe(expected.length);
  });

  it("dismisses the marker suggestion with Escape without changing source", () => {
    const source = `${numericQuestion}\n`;
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    caretToEnd(editor, source);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByTestId("exact-editor-value").textContent).toBe(source);
  });

  it("does not offer the marker again once the question has an answer line", () => {
    const source = `${numericQuestion}\nĐáp án: 2.50\n`;
    render(<EditorHarness initial={source} />);
    const editor = editorElement();
    caretToEnd(editor, source);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});

describe("QuizMarkdownCodeEditor display-math highlighting", () => {
  it("styles structural-looking markers inside $$ blocks as literal content", () => {
    const source =
      "Câu 1 [SINGLE_CHOICE]: Compute\n$$\nCâu 99 [NUMERIC_FILL]: x^2\n*A. fake\n$$\n*A. real";
    render(<EditorHarness initial={source} />);
    const layer = screen.getByTestId("quiz-markdown-highlight-layer");

    const spans = Array.from(layer.querySelectorAll("span"));
    const fakeHeader = spans.find((node) =>
      node.textContent?.startsWith("Câu 99"),
    );
    const fakeOption = spans.find((node) => node.textContent === "*A. fake");
    const starSpans = spans.filter((node) => node.textContent === "*");
    const realContent = spans.find((node) => node.textContent === " real");

    expect(fakeHeader?.getAttribute("class")).toContain("64748B");
    // Inside math, "*A. fake" stays ONE muted literal span — no green
    // structural star exists inside the block.
    expect(fakeOption?.getAttribute("class")).toContain("64748B");
    expect(starSpans).toHaveLength(1);
    // After the block closes, structural highlighting resumes.
    expect(starSpans[0]?.getAttribute("class")).toContain("10B981");
    expect(realContent?.getAttribute("class")).not.toContain("64748B");
  });

  it("styles the $$ delimiters themselves but keeps fence content outside math", () => {
    const source = "```text\n$$\nCâu 9 [NUMERIC_FILL]: inside fence\n```\n$$";
    render(<EditorHarness initial={source} />);
    const layer = screen.getByTestId("quiz-markdown-highlight-layer");

    const spans = Array.from(layer.querySelectorAll("span"));
    const insideFence = spans.find((node) =>
      node.textContent?.startsWith("Câu 9"),
    );
    const firstDelimiter = spans.find(
      (node) => node.textContent === "$$" && node.getAttribute("class")?.includes("F59E0B"),
    );
    expect(insideFence?.getAttribute("class")).toContain("64748B");
    expect(firstDelimiter).toBeDefined();
  });
});

describe("QuizMarkdownCodeEditor multiple instances", () => {
  it("scopes labels, suggestion listboxes and option ids per instance", () => {
    function TwoEditors() {
      const [left, setLeft] = useState("câu");
      const [right, setRight] = useState("Câu 1 [NUMERIC_FILL]: v?\nĐ");
      return (
        <>
          <QuizMarkdownCodeEditor onChange={setLeft} value={left} />
          <QuizMarkdownCodeEditor onChange={setRight} value={right} />
        </>
      );
    }
    render(<TwoEditors />);

    const editors = screen.getAllByLabelText<HTMLTextAreaElement>(
      "Quiz Markdown source",
    );
    expect(editors).toHaveLength(2);
    expect(editors[0]?.id).not.toBe(editors[1]?.id);

    // Move each caret to its line end so both instances show suggestions:
    // left → 4 question snippets, right → the single Đáp án: completion.
    for (const editor of editors) {
      fireEvent.select(editor, {
        target: {
          selectionStart: editor.value.length,
          selectionEnd: editor.value.length,
        },
      });
    }
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Câu 1 [SINGLE_CHOICE]:",
      "Câu 1 [MULTIPLE_CHOICE]:",
      "Câu 1 [TRUE_FALSE_MATRIX]:",
      "Câu 1 [NUMERIC_FILL]:",
      "Đáp án:",
    ]);
    const ids = options.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);

    // aria-controls of each textarea points at an existing listbox.
    for (const editor of editors) {
      const listboxId = editor.getAttribute("aria-controls");
      expect(listboxId).not.toBeNull();
      expect(document.getElementById(listboxId!)).not.toBeNull();
      expect(editor.getAttribute("aria-expanded")).toBe("true");
    }
  });
});
