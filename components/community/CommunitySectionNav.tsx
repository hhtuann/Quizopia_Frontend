import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Section = "browse" | "saved";

const tabClass =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2";

export function CommunitySectionNav({ current }: { current: Section }) {
  return (
    <nav aria-label="Community sections" className="mb-6 flex flex-wrap items-center gap-2">
      <Link
        href="/community"
        aria-current={current === "browse" ? "page" : undefined}
        className={cn(
          tabClass,
          current === "browse"
            ? "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]"
            : "border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#0052FF]"
        )}
      >
        Explore quizzes
      </Link>
      <Link
        href="/community/bookmarks"
        aria-current={current === "saved" ? "page" : undefined}
        className={cn(
          tabClass,
          current === "saved"
            ? "border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]"
            : "border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#0052FF]"
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
        </svg>
        Saved quizzes
      </Link>
    </nav>
  );
}
