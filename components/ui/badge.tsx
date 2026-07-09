import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold outline-none",
  {
    variants: {
      variant: {
        default: "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]",
        accent: "border border-[#0052FF]/30 bg-[#0052FF]/5 text-[#0052FF]",
        success: "border border-[#10B981]/30 bg-[#10B981]/5 text-[#10B981]",
        warn: "border border-[#F59E0B]/30 bg-[#F59E0B]/5 text-[#F59E0B]",
        destructive: "border border-[#EF4444]/30 bg-[#EF4444]/5 text-[#EF4444]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
