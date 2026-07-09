import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const cardVariants = cva(
  "rounded-xl border border-[#E2E8F0] bg-white outline-none transition-all duration-200",
  {
    variants: {
      variant: {
        standard: "shadow-[0_4px_6px_rgba(0,0,0,0.07)] hover:shadow-[0_20px_25px_rgba(0,0,0,0.1)]",
        elevated: "shadow-[0_10px_15px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_25px_rgba(0,0,0,0.1)]",
        featured: "shadow-[0_10px_15px_rgba(0,0,0,0.08)]",
      },
    },
    defaultVariants: {
      variant: "standard",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

/** Featured card with gradient border (2px stroke via nested div). */
export function FeaturedCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-gradient-to-br from-[#0052FF] via-[#4D7CFF] to-[#0052FF] p-[2px]",
        className
      )}
      {...props}
    >
      <div className="h-full w-full rounded-[calc(0.75rem-2px)] bg-white">
        {children}
      </div>
    </div>
  );
}

export { cardVariants };
