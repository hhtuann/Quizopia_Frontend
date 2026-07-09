import { cn } from "@/lib/utils/cn";

export interface SectionLabelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Show a pulsing dot before the label. */
  pulse?: boolean;
}

/**
 * DESIGN_NEXT section label pill — accent border/tint + mono uppercase tracking.
 * Optionally shows a pulsing dot.
 */
export function SectionLabel({
  className,
  pulse = false,
  children,
  ...props
}: SectionLabelProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-full border border-[#0052FF]/30 bg-[#0052FF]/5 px-5 py-2",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full bg-[#0052FF]",
          pulse && "animate-pulse"
        )}
      />
      <span className="font-mono text-xs uppercase tracking-[0.15em] text-[#0052FF]">
        {children}
      </span>
    </div>
  );
}
