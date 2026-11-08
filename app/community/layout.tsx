import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PublicHeader } from "@/components/layout/PublicHeader";

/**
 * Public Community layout (P3-A-FE1, issue #43 — ADR-006 §10).
 *
 * Lives at the TOP LEVEL of `app/` next to `/login`, deliberately OUTSIDE every
 * authenticated route group: no `RequireAuth`, no `AppShell`/`Sidebar` —
 * anonymous deep links (`/community?tags=algebra`, `/community/quizzes/7`)
 * must render for signed-out visitors. The authenticated `AppShell`/`Header`
 * are untouched; this layout swaps in the minimal anonymous `PublicHeader`.
 *
 * `main` centers content at a local `max-w-6xl` readability cap (DESIGN.md:
 * width limits are local constraints, never shell-wide) and consumes the shared
 * `--page-gutter` token. `.app-main` is intentionally NOT used — it carries the
 * authenticated shell's fixed-sidebar margin.
 *
 * SEO/cache: the metadata here is fully static (no community/user content —
 * §10 forbids answers/PII in DOM or metadata). The pages below are client
 * components; catalog data is fetched at runtime from `no-store` endpoints, so
 * nothing user-derived is ever prerendered or cached in the HTML.
 */
export const metadata: Metadata = {
  title: "Community — Quizopia",
  description: "Browse quizzes published publicly by the Quizopia community.",
};

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-[var(--page-gutter)] pb-16 pt-6 sm:pt-8">
        {children}
      </main>
    </div>
  );
}
