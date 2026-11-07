"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { passwordApi } from "@/lib/api/password";
import { invalidateSession } from "@/lib/auth/store";
import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/lib/validation/password-schema";
import type { NormalizedApiError } from "@/lib/api";

/** Generic message for every rejected token — invalid, expired, replaced or reused. */
const RESET_LINK_INVALID =
  "This password-reset link is invalid, expired, or has already been used.";

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

function RequestNewLinkFooter() {
  return (
    <p className="mt-6 text-center text-sm font-medium text-[#64748B]">
      <Link
        href="/forgot-password"
        className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
      >
        Request a new link
      </Link>
    </p>
  );
}

export default function ResetPasswordPage() {
  const router = useRouter();
  // The opaque reset token lives ONLY in this ref for the page's lifetime:
  // never in the URL (stripped below), storage, or logs.
  const tokenRef = useRef<string | null>(null);
  // StrictMode double-invokes mount effects; capture exactly once per page load.
  const capturedRef = useRef(false);
  const [phase, setPhase] = useState<"capturing" | "missing" | "form" | "invalid">("capturing");
  const [showNew, setShowNew] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (capturedRef.current) return;
    capturedRef.current = true;
    const raw = window.location.hash;
    tokenRef.current = raw.startsWith("#")
      ? new URLSearchParams(raw.slice(1)).get("token")?.trim() || null
      : null;
    // IMMEDIATELY strip the fragment from the address bar and session history
    // — before any network activity — so the token never lingers in the URL.
    // Next.js' own history.state blob is preserved (only the URL changes).
    if (raw) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    setPhase(tokenRef.current ? "form" : "missing");
  }, []);

  const newPassword = watch("newPassword");
  const confirmPassword = watch("confirmPassword");

  const rules = [
    { label: "At least 8 characters", ok: newPassword.length >= 8 },
    { label: "At most 128 characters", ok: newPassword.length <= 128 },
    { label: "Both new password entries match", ok: newPassword.length > 0 && newPassword === confirmPassword },
  ];

  const onSubmit = async (values: ResetPasswordValues) => {
    const token = tokenRef.current;
    if (!token) {
      setPhase("missing");
      return;
    }
    setFormError(null);
    try {
      await passwordApi.resetPassword({ token, ...values });
      // 204: the server revoked every session (refresh cookie included).
      // Drop any current local auth synchronously and land on login — the
      // reset never auto-logs in.
      invalidateSession();
      router.replace("/login?passwordReset=1");
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "network") {
        setFormError("Network error — check your connection and try again.");
      } else if (norm?.kind === "api") {
        // Invalid, expired, replaced and already-used tokens share one 400
        // code — one generic retry state, no distinguishing details.
        setPhase("invalid");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 select-none text-center">
          <h1 className="font-display text-3xl tracking-tight text-[#0F172A]">
            Choose a <span className="gradient-text">new password</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Pick a new password for your Quizopia account.
          </p>
        </div>

        <Card variant="elevated" className="p-8 sm:p-10">
          {phase === "missing" ? (
            <>
              <div role="alert" className="mb-6 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
                This reset link is incomplete — its token is missing.
              </div>
              <RequestNewLinkFooter />
            </>
          ) : phase === "invalid" ? (
            <>
              <div role="alert" className="mb-6 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]">
                {RESET_LINK_INVALID} Request a new link to continue.
              </div>
              <RequestNewLinkFooter />
              <p className="mt-6 text-center text-sm font-medium text-[#64748B]">
                <Link
                  href="/login"
                  className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
                >
                  Back to sign in
                </Link>
              </p>
            </>
          ) : (
            <form
              noValidate
              aria-busy={isSubmitting}
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="newPassword"
                  className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
                >
                  New password
                </label>
                <div className="flex gap-2">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    aria-invalid={!!errors.newPassword}
                    aria-describedby={errors.newPassword ? "newPassword-error" : "reset-password-rules"}
                    className={cn(
                      errors.newPassword && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]",
                    )}
                    {...field("newPassword")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={showNew}
                    onClick={() => setShowNew(!showNew)}
                  >
                    {showNew ? "Hide" : "Show"}
                  </Button>
                </div>
                <FieldError id="newPassword-error" message={errors.newPassword?.message} />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
                >
                  Confirm new password
                </label>
                <Input
                  id="confirmPassword"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? "confirmPassword-error" : "reset-password-rules"}
                  className={cn(
                    errors.confirmPassword && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]",
                  )}
                  {...field("confirmPassword")}
                />
                <FieldError id="confirmPassword-error" message={errors.confirmPassword?.message} />
              </div>

              <ul id="reset-password-rules" className="space-y-1 text-sm">
                {rules.map((rule) => (
                  <li
                    key={rule.label}
                    aria-label={rule.label}
                    className={rule.ok ? "text-[#15803D]" : "text-[#64748B]"}
                  >
                    {rule.ok ? "✓" : "•"} {rule.label}
                  </li>
                ))}
              </ul>

              {formError && (
                <p role="alert" className="pl-1 text-sm font-semibold text-[#EF4444]">
                  {formError}
                </p>
              )}

              <p className="text-xs text-[#64748B]">
                For your security, every signed-in device — including this one — will be
                signed out once the password changes.
              </p>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Resetting…" : "Reset password"}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
