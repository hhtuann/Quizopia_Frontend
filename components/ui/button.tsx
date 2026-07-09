"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,82,255,0.35)] hover:brightness-110 active:scale-[0.98]",
        outline:
          "border border-[#E2E8F0] bg-transparent text-[#0F172A] hover:border-[#0052FF]/30 hover:bg-[#F1F5F9] hover:shadow-sm",
        ghost:
          "bg-transparent text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
      },
      size: {
        sm: "h-9 px-4 text-xs",
        md: "h-12 px-6 text-sm",
        lg: "h-14 px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
