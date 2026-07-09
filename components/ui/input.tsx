import { cn } from "@/lib/utils/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 text-sm text-[#0F172A] outline-none transition-all duration-200 placeholder:text-[#64748B]/50 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2",
        className
      )}
      {...props}
    />
  );
}
