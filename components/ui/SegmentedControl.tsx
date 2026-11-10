"use client";

import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  readonly label: string;
  readonly value: T;
}

/**
 * Shared segmented control (tab-style mode switch) used by the question-bank
 * import (Excel | Markdown Authoring), the class add-students panel
 * (Search | Excel Import | Email Invitations) and community moderation
 * status filtering. Pattern: `role="group"` with `aria-pressed` buttons; the
 * active option gets the accent gradient. Sizing follows the canonical tab
 * bar recipe (see DESIGN.md → "Tabs & Segmented Controls").
 */
export function SegmentedControl<T extends string>({
  "aria-label": ariaLabel,
  onChange,
  options,
  value,
}: {
  "aria-label": string;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  value: T;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF]",
              active
                ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                : "text-[#64748B] hover:bg-white hover:text-[#0F172A]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
