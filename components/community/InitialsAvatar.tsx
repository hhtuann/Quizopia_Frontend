import { initialsOf } from "@/lib/utils/initials";
import { cn } from "@/lib/utils/cn";

/**
 * Compact circular avatar with deterministic initials (Epic #70 F4/F5,
 * issue #73) — the Facebook-style discussion surface. No avatar upload
 * exists (and none is added): the initials are derived from the public
 * display name, the same gradient treatment as the header/profile
 * avatars. `aria-hidden` — the adjacent visible name carries the
 * identity, so screen readers never hear the initials twice.
 */
export function InitialsAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-xs font-bold uppercase text-white",
        className
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
