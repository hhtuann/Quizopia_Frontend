"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, type ReactNode } from "react";

/**
 * Renders the accepted Quiz Markdown content subset (donor behavior, Quizopia
 * System visual language): plain text, bold, italic, inline code, fenced code
 * blocks, inline math `$...$` and display math `$$...$$` (FE-05, approved).
 *
 * Safety: text is rendered as React text nodes (auto-escaped); the only HTML
 * injection point is KaTeX output, which escapes its input, runs with
 * `trust: false` + `strict: "error"` and bounded expansion (`maxExpand`,
 * `maxSize`); malformed math falls back to the literal authored source.
 */

const INLINE_TOKEN =
  /(`[^`\n]+`|(?<!\\)\$(?!\s)[^$\n]+(?<!\s)\$(?!\$)|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

function renderMath(source: string, displayMode: boolean, key: number): ReactNode {
  try {
    const html = katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      trust: false,
      strict: "error",
      maxExpand: 100,
      maxSize: 20,
    });
    if (displayMode) {
      return (
        <div
          className="overflow-x-auto py-1"
          dangerouslySetInnerHTML={{ __html: html }}
          key={key}
        />
      );
    }
    return <span dangerouslySetInnerHTML={{ __html: html }} key={key} />;
  } catch {
    // Unknown or malformed math stays visible as the literal authored source.
    return displayMode ? `$$${source}$$` : `$${source}$`;
  }
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Match code before math, and only recognize unescaped, paired dollar signs
  // with non-whitespace inner edges.
  const pattern = new RegExp(INLINE_TOKEN.source, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code
          className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1 py-0.5 font-mono text-[0.92em] text-[#0F172A]"
          key={key++}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("$")) {
      const contents = token.slice(1, -1);
      // Treat ambiguous currency prose as text, not an accidental math expression.
      const currencyProse = /^\d+(?:[.,]\d{1,2})?\s+(?:and|or)\s*$/i.test(
        contents,
      );
      nodes.push(
        contents.trim() === contents && !currencyProse
          ? renderMath(contents, false, key++)
          : token,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong className="font-semibold text-[#0F172A]" key={key++}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes;
}

function fenceOpening(line: string): number | null {
  if (!line.startsWith("```")) return null;
  let count = 0;
  while (line[count] === "`") count += 1;
  return line.slice(count).includes("`") ? null : count;
}

function fenceClosing(line: string, ticks: number): boolean {
  let count = 0;
  while (line[count] === "`") count += 1;
  return count >= ticks && line.slice(count).trim().length === 0;
}

export function MarkdownContent({ value }: { readonly value: string }) {
  const lines = value.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let fenceTicks = 0;
  let displayMath: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const current = paragraph;
    blocks.push(
      <p className="leading-7" key={`p-${blocks.length}`}>
        {current.map((line, index) => (
          <Fragment key={`${index}-${line}`}>
            {index > 0 ? <br /> : null}
            {renderInline(line)}
          </Fragment>
        ))}
      </p>,
    );
    paragraph = [];
  }

  function flushCode() {
    if (code === null) return;
    blocks.push(
      <pre
        className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-3 text-sm leading-6"
        key={`code-${blocks.length}`}
      >
        <code className="font-mono text-[#0F172A]">{code.join("\n")}</code>
      </pre>,
    );
    code = null;
    fenceTicks = 0;
  }

  lines.forEach((line) => {
    if (code !== null) {
      if (fenceClosing(line, fenceTicks)) {
        flushCode();
      } else {
        code.push(line);
      }
      return;
    }
    if (displayMath !== null) {
      if (line.trim() === "$$") {
        blocks.push(renderMath(displayMath.join("\n"), true, blocks.length));
        displayMath = null;
      } else {
        displayMath.push(line);
      }
      return;
    }
    const opening = fenceOpening(line);
    if (opening !== null) {
      flushParagraph();
      fenceTicks = opening;
      code = [];
    } else if (line.trim() === "$$") {
      flushParagraph();
      displayMath = [];
    } else if (/^\$\$[^$\n]+\$\$$/.test(line.trim())) {
      flushParagraph();
      blocks.push(renderMath(line.trim().slice(2, -2), true, blocks.length));
    } else if (line.trim().length === 0) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  });
  flushParagraph();
  flushCode();
  const unclosedMath = displayMath as string[] | null;
  if (unclosedMath !== null) {
    blocks.push(`$$\n${unclosedMath.join("\n")}`);
  }

  return <div className="space-y-3">{blocks}</div>;
}
