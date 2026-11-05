"use client";

import { notFound } from "next/navigation";
import { useState } from "react";
import { QuizMarkdownAuthoringPane } from "@/components/markdown/authoring-pane";

/**
 * DEVELOPMENT-ONLY harness for manually verifying the Quiz Markdown editor
 * and preview (Issue #8). Serves 404 in production builds; not linked from
 * any navigation and performs no API or persistence work.
 */

const SAMPLE = [
  "Câu 1 [SINGLE_CHOICE]: Giao thức nào thuộc tầng Application?",
  "*A. HTTP",
  "B. TCP",
  "C. IP",
  "D. UDP",
  "Lời giải: TCP và UDP thuộc tầng **Transport**, không phải Application.",
  "",
  "Câu 2 [MULTIPLE_CHOICE]: Chọn các số nguyên tố.",
  "*A. 2",
  "B. 4",
  "*C. 5",
  "D. 9",
  "",
  "Câu 3 [TRUE_FALSE_MATRIX]: Đánh dấu đúng/sai.",
  "*A. $E = mc^2$ là phương trình của Einstein",
  "B. `int x = 1;` là khai báo Python",
  "C. HTTP stateless",
  "D. UDP đảm bảo delivery",
  "",
  "Câu 4 [NUMERIC_FILL]: Giá trị của $10 / 4$ (hai chữ số thập phân)?",
  "",
  "```text",
  "Câu 99 [MULTIPLE_CHOICE]: đây chỉ là code",
  "```",
  "",
  "$$",
  "\\frac{10}{4} = 2.5",
  "$$",
  "",
  "Đáp án: 2.50",
  "Lời giải: `10 / 4 = 2.5`.",
  "",
].join("\r\n");

export default function MarkdownAuthoringHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const [source, setSource] = useState(SAMPLE);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <p className="mb-4 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-3 py-2 font-mono text-xs text-[#F59E0B]">
        Development-only harness — not available in production.
      </p>
      <QuizMarkdownAuthoringPane
        onChange={setSource}
        title="Quiz Markdown authoring (dev)"
        value={source}
      />
    </main>
  );
}
