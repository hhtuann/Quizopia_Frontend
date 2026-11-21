// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuizMarkdownAuthoringPane } from "./authoring-pane";

// The bankId variant embeds the AI Assistant chat; stub its API module so
// these pane tests stay offline (the status probe resolves as available).
vi.mock("@/lib/api/ai-authoring", () => ({
  getAiAuthoringStatus: vi.fn(() =>
    Promise.resolve({ enabled: true, available: true, model: "test-model" }),
  ),
  extractAiDocument: vi.fn(),
  authorAiMarkdown: vi.fn(),
}));
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
    expect(view.getByText("Question 1")).not.toBeNull();
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

  it("switches back to the visible Editor pane before focusing a diagnostic (mobile navigation regression)", () => {
    const broken = "Câu 1 [bogus]: stem\n*A. a\nB. b\nC. c\nD. d";
    const { view } = setup(broken);
    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    const editorPane = view
      .getByLabelText("Quiz Markdown source")
      .closest("div.grid > div");
    expect(editorPane?.className).toContain("hidden");

    const diagnosticButton = view
      .getAllByRole("button")
      .find((button) => button.textContent?.includes("UNKNOWN_QUESTION_TYPE"));
    fireEvent.click(diagnosticButton!);

    // Editor pane became visible before the caret was positioned.
    expect(editorPane?.className).not.toContain("hidden");
    const textarea = view.getByLabelText(
      "Quiz Markdown source",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(7);
    // Source value and preview pane state preserved.
    expect(textarea.value).toBe(broken);
  });

  it("switches back to the visible Editor pane before focusing a question source (mobile navigation regression)", () => {
    const { view } = setup(sample);
    fireEvent.click(view.getByRole("button", { name: "Preview" }));

    const editorPane = view
      .getByLabelText("Quiz Markdown source")
      .closest("div.grid > div");
    fireEvent.click(
      view.getByRole("button", { name: /question 2, line 6/ }),
    );

    expect(editorPane?.className).not.toContain("hidden");
    const textarea = view.getByLabelText(
      "Quiz Markdown source",
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(sample.indexOf("Câu 2"));
    expect(textarea.value).toBe(sample);
  });

  it("hides the Editor/Preview switch on desktop-sized viewports", () => {
    const { view } = setup(sample);
    const switchWrap = view
      .getByRole("button", { name: "Editor" })
      .closest("div.lg\\:hidden");
    expect(switchWrap).not.toBeNull();
  });
});

describe("QuizMarkdownAuthoringPane with bankId", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(cleanup);

  function setupWithAi(value: string) {
    const onChange = vi.fn();
    const view = render(
      <QueryClientProvider client={queryClient}>
        <QuizMarkdownAuthoringPane bankId={7} onChange={onChange} value={value} />
      </QueryClientProvider>,
    );
    return { onChange, view };
  }

  it("shows Ask AI / Back to Preview and keeps the editor mounted while switching", async () => {
    const { view } = setupWithAi(sample);
    // Default: live preview visible with the Ask AI action (no tab bar).
    expect(view.queryByRole("tab")).toBeNull();
    const askAi = view.getByRole("button", { name: "Ask AI" });
    expect(view.getByText("Live preview (authoring)")).not.toBeNull();

    const textarea = view.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement;
    expect(textarea.value).toBe(sample);

    fireEvent.click(askAi);
    // Action flips to Back to Preview; the AI header replaces the preview's.
    expect(view.getByRole("button", { name: "Back to Preview" })).not.toBeNull();
    expect(view.getByText("AI Assistant")).not.toBeNull();
    // Editor is NOT remounted: same DOM node, same value, still queryable.
    expect(view.getByLabelText("Quiz Markdown source")).toBe(textarea);
    expect((view.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement).value).toBe(sample);
    // The chat composer is present alongside the still-mounted preview.
    await waitFor(() =>
      expect(view.getByLabelText("Message the AI assistant")).not.toBeNull());

    // Back to Preview restores the preview; editor still the same node.
    fireEvent.click(view.getByRole("button", { name: "Back to Preview" }));
    expect(view.getByRole("button", { name: "Ask AI" })).not.toBeNull();
    expect(view.getByLabelText("Quiz Markdown source")).toBe(textarea);
    expect((view.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement).value).toBe(sample);
  });

  it("preserves chat state across Ask AI / Back to Preview switching (UX-08)", async () => {
    const { view } = setupWithAi(sample);
    fireEvent.click(view.getByRole("button", { name: "Ask AI" }));
    const composer = await waitFor(() =>
      view.getByLabelText("Message the AI assistant") as HTMLTextAreaElement,
    );
    fireEvent.change(composer, { target: { value: "draft prompt about networking" } });

    fireEvent.click(view.getByRole("button", { name: "Back to Preview" }));
    fireEvent.click(view.getByRole("button", { name: "Ask AI" }));

    // The draft prompt survived: the chat was hidden, never unmounted.
    const restored = view.getByLabelText("Message the AI assistant") as HTMLTextAreaElement;
    expect(restored).toBe(composer);
    expect(restored.value).toBe("draft prompt about networking");
  });

  it("exposes AI on the mobile 3-way switch and hides the editor pane while active", async () => {
    const { view } = setupWithAi(sample);
    const editorPane = view.getByLabelText("Quiz Markdown source").closest("div.grid > div");
    expect(editorPane).not.toBeNull();

    fireEvent.click(view.getByRole("button", { name: "AI" }));
    expect(editorPane?.className).toContain("hidden");
    await waitFor(() =>
      expect(view.getByRole("button", { name: "Upload document" })).not.toBeNull(),
    );

    fireEvent.click(view.getByRole("button", { name: "Editor" }));
    expect(editorPane?.className).not.toContain("hidden");
    expect((view.getByLabelText("Quiz Markdown source") as HTMLTextAreaElement).value).toBe(sample);
  });

  it("does not render the Ask AI action without a bankId", () => {
    const { view } = setup(sample);
    expect(view.queryByRole("button", { name: "Ask AI" })).toBeNull();
    expect(view.getByRole("button", { name: "Preview" })).not.toBeNull();
  });
});
