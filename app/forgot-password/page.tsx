"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { passwordApi } from "@/lib/api/password";
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/lib/validation/password-schema";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Identical confirmation for EVERY syntactically valid submit — the text must
 * not vary with the address (no account-existence or eligibility leak; the
 * backend answers 202 generically, including throttled requests).
 */
export const NEUTRAL_CONFIRMATION =
  "If an account exists for that email, a password-reset link is on its way. For your security, we can't confirm whether the address is registered.";

/** Client-side resend cooldown (seconds); mirrors the server's per-email gap. */
const RESEND_COOLDOWN_SECONDS = 60;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#EF4444]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
        />
      </svg>
      {message}
    </p>
  );
}

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const onSubmit = async (values: ForgotPasswordValues) => {
    setFormError(null);
    try {
      // 202 for every syntactically valid request — eligibility is never
      // signalled, so the confirmation below is always the same.
      await passwordApi.forgotPassword(values.email);
      setSubmitted(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "network") {
        setFormError("Network error — check your connection and try again.");
      } else {
        // Syntax-level rejection only (independent of account existence).
        setFormError("Enter a valid email address and try again.");
      }
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 select-none text-center">
          <h1 className="font-display text-3xl tracking-tight text-[#0F172A]">
            Forgot your <span className="gradient-text">password</span>?
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Enter your account email and we&apos;ll send you a reset link.
          </p>
        </div>

        <Card variant="elevated" className="p-8 sm:p-10">
          {submitted ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0052FF]/10 text-[#0052FF]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-7 w-7"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 9.409a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              </span>
              <div>
                <p className="text-lg font-bold text-[#0F172A]">Check your email</p>
                <p role="status" className="mt-1 text-sm font-medium text-[#64748B]">
                  {NEUTRAL_CONFIRMATION}
                </p>
              </div>

              {formError && (
                <p role="alert" className="pl-1 text-sm font-semibold text-[#EF4444]">
                  {formError}
                </p>
              )}

              <button
                type="button"
                onClick={() => void handleSubmit(onSubmit)()}
                disabled={cooldown > 0 || isSubmitting}
                className="rounded text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:text-[#64748B] disabled:no-underline"
              >
                {isSubmitting
                  ? "Sending…"
                  : cooldown > 0
                    ? `Resend link (${cooldown}s)`
                    : "Resend link"}
              </button>

              <p className="border-t border-[#E2E8F0] pt-4 text-xs font-medium text-[#64748B]">
                Remembered it?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#0052FF] hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={cn(
                    errors.email && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]",
                  )}
                  {...field("email")}
                />
                <FieldError id="email-error" message={errors.email?.message} />
              </div>

              {formError && (
                <p role="alert" className="pl-1 text-sm font-semibold text-[#EF4444]">
                  {formError}
                </p>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          {!submitted && (
            <p className="mt-6 text-center text-sm font-medium text-[#64748B]">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
              >
                Create one
              </Link>
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
