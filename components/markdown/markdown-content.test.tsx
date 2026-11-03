// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownContent } from "./markdown-content";

afterEach(cleanup);

function containerOf(value: string) {
  const { container } = render(<MarkdownContent value={value} />);
  return container;
}

describe("MarkdownContent (safe subset + KaTeX)", () => {
  it("renders bold, italic and inline code as styled text", () => {
    const container = containerOf("plain **bold** and *italic* plus `code`");
    const strong = container.querySelector("strong");
    const em = container.querySelector("em");
    const code = container.querySelector("code");
    expect(strong?.textContent).toBe("bold");
    expect(em?.textContent).toBe("italic");
    expect(code?.textContent).toBe("code");
  });

  it("renders inline and display math through KaTeX", () => {
    const container = containerOf(
      "Value $E = mc^2$ here\n\n$$\n\\frac{10}{4}\n$$",
    );
    expect(container.querySelectorAll(".katex").length).toBe(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("renders a single-line display math block", () => {
    const container = containerOf("$$x^2$$");
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("falls back to literal source for malformed math", () => {
    const container = containerOf("bad $\\notacommand{x}$ end");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$\\notacommand{x}$");
  });

  it("keeps ambiguous currency prose as plain text", () => {
    const container = containerOf("He paid $3 and$ left");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$3 and$");
  });

  it("does not interpret fenced code as math or structure", () => {
    const container = containerOf(
      "```text\n$E = mc^2$\nCâu 99 [MULTIPLE_CHOICE]: fake\n```",
    );
    expect(container.querySelector(".katex")).toBeNull();
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toContain("Câu 99 [MULTIPLE_CHOICE]: fake");
    expect(pre?.textContent).toContain("$E = mc^2$");
  });

  it("renders inline code literally without math interpretation", () => {
    const container = containerOf("use `$x^2$` inline");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("$x^2$");
  });

  it("escapes malicious HTML instead of executing it", () => {
    const container = containerOf(
      '<script>alert(1)</script> and <img src=x onerror="alert(2)">',
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain('<img src=x onerror="alert(2)">');
  });

  it("blocks unsafe KaTeX commands like \\href", () => {
    const container = containerOf("$\\href{javascript:alert(1)}{click}$");
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.textContent).toContain("\\href");
  });

  it("shows unclosed display math as literal source", () => {
    const container = containerOf("$$\n\\frac{1}{2}");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$$");
    expect(container.textContent).toContain("\\frac{1}{2}");
  });
});
