"use client";

import { cn } from "@/lib/utils/cn";

export interface SegmentedOption<T extends string> {
  readonly label: string;
  readonly value: T;
}

/**
 * Shared segmented control (tab-style mode switch) used by the question-bank
 * import (Excel | Markdown Authoring) and the class add-students panel
 * (Search | Excel Import | Email Invitations). Pattern: `role="group"` with
 * `aria-pressed` buttons; the active option gets the accent gradient.
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
      className="mb-4 inline-flex rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-1"
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
              "h-11 rounded-lg px-5 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
              active
                ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white"
                : "text-[#64748B] hover:text-[#0F172A]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
