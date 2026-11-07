"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { QuizopiaLogo } from "./QuizopiaLogo";
import { cn } from "@/lib/utils/cn";

/**
 * P3-A-FE1 (#43, ADR-006 §10) — the ANONYMOUS-CAPABLE public header.
 *
 * No anonymous header existed before Community: `AppShell`/`Header` render only
 * inside authenticated route groups. This is the minimal public chrome the ADR
 * calls for — brand + Log in/Register CTAs — and it is used ONLY by
 * `app/community/layout.tsx`. It is deliberately static:
 *
 * - no `useAuth` (renders identically for guests AND during hydration —
 *   authenticated users reach /community through the sidebar but this header
 *   stays anonymous-only chrome; the brand link leads back to the app);
 * - no user data, no notifications, no view switch — nothing to leak;
 * - geometry comes from the shared tokens (`app-topbar`, `app-topbar-inner`,
 *   `--page-gutter`, `--topbar-height`) so it aligns with DESIGN.md's fixed
 *   topbar rules; buttons are `h-11` (44px) to honor the touch-target floor.
 */
export function PublicHeader() {
  return (
    <header className="app-topbar w-full border-b border-[#E2E8F0] bg-white/95">
      <div className="app-topbar-inner flex items-center justify-between gap-3">
        <Link
          href="/"
          aria-label="Quizopia home"
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
        >
          <QuizopiaLogo withWordmark wordmarkClassName="hidden sm:inline" />
        </Link>
        <nav aria-label="Account actions" className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-11 px-4 text-xs sm:text-sm"
            )}
          >
            Log in
          </Link>
          <Link
            href="/register"
            className={cn(
              buttonVariants({ variant: "primary", size: "sm" }),
              "h-11 px-4 text-xs sm:text-sm"
            )}
          >
            Register
          </Link>
        </nav>
      </div>
    </header>
  );
}
