"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { authApi } from "@/lib/auth";
import type { NormalizedApiError } from "@/lib/api";
import { PENDING_VERIFICATION_EMAIL } from "@/app/register/page";

const OTP_LENGTH = 6;

/**
 * Identity-M1 email verification screen. The 6-digit OTP arrives by mail;
 * nothing OTP-related is ever persisted client-side (sessionStorage holds
 * only the pending email so the page can prefill). Handles wrong / expired /
 * maxed-out codes, a resend button with a server-driven cooldown countdown,
 * and routes to the login page on success.
 */
export default function VerifyEmailPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [status, setStatus] = useState<"idle" | "verifying" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  // Uncontrolled email input, prefilled from sessionStorage via the ref
  // callback (runs once, client-side — no setState inside an effect).
  const emailRef = useRef<HTMLInputElement | null>(null);
  const getEmail = useCallback(() => emailRef.current?.value.trim() ?? "", []);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const otp = digits.join("");

  const submit = useCallback(
    async (code: string) => {
      const email = getEmail();
      if (code.length !== OTP_LENGTH || !email) return;
      setStatus("verifying");
      setError(null);
      setErrorCode(null);
      try {
        await authApi.verifyEmail({ email, otp: code });
        setStatus("success");
        try {
          sessionStorage.removeItem(PENDING_VERIFICATION_EMAIL);
        } catch {
          // ignore
        }
        // A short success beat so the confirmation is perceivable, then off
        // to the login page (verification does not issue tokens).
        setTimeout(() => router.replace("/login?verified=1"), 1200);
      } catch (err) {
        const norm = err as NormalizedApiError;
        setStatus("idle");
        if (norm?.kind === "api") {
          setErrorCode(norm.code);
          switch (norm.code) {
            case "AUTH_OTP_INVALID":
              setError("That code isn't right. Check the email and try again.");
              break;
            case "AUTH_OTP_EXPIRED":
              setError("This code has expired. Request a new one below.");
              break;
            case "AUTH_OTP_MAX_ATTEMPTS":
              setError("Too many attempts. Request a new code below.");
              break;
            case "AUTH_OTP_NOT_FOUND":
              setError("No active code for this email. Request a new one below.");
              break;
            case "AUTH_RATE_LIMITED":
              setError("Too many requests — please wait a bit and try again.");
              break;
            default:
              setError(norm.message || "Verification failed. Please try again.");
          }
        } else if (norm?.kind === "network") {
          setError("Network error — check your connection and try again.");
        } else {
          setError("Something went wrong. Please try again.");
        }
      }
    },
    [getEmail, router],
  );

  const setDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Paste of a full code: distribute across the boxes.
      const chars = clean.slice(0, OTP_LENGTH).split("");
      const next = Array(OTP_LENGTH).fill("");
      chars.forEach((c, i) => (next[i] = c));
      setDigits(next);
      const filled = next.join("");
      if (filled.length === OTP_LENGTH) void submit(filled);
      inputsRef.current[Math.min(chars.length, OTP_LENGTH - 1)]?.focus();
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    if (clean && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
      event.preventDefault();
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
      event.preventDefault();
    }
  };

  const resend = async () => {
    const email = getEmail();
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    setErrorCode(null);
    setInfo(null);
    try {
      // R2-M1-C: resend ALWAYS answers 200 with the cooldown window — the
      // server never signals account state; issuance happens only when
      // actually eligible.
      const result = await authApi.resendVerificationOtp(email);
      setCooldown(result.resendCooldownSeconds);
      setInfo("If this address is eligible, a new code is on its way; previous codes are now invalid.");
      setDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "network") {
        setError("Network error — check your connection and try again.");
      } else {
        setError("Could not resend the code. Please try again.");
      }
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 select-none text-center">
          <h1 className="font-display text-3xl tracking-tight text-[#0F172A]">
            Verify your <span className="gradient-text">email</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            We sent a 6-digit code to your email address.
          </p>
        </div>

        <Card variant="elevated" className="p-8 sm:p-10">
          {status === "success" ? (
            <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0052FF]/10 text-[#0052FF]">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </span>
              <div>
                <p className="text-lg font-bold text-[#0F172A]">Email verified!</p>
                <p className="mt-1 text-sm font-medium text-[#64748B]">
                  Taking you to sign in…
                </p>
              </div>
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit(otp);
              }}
              className="space-y-5"
            >
              <div>
                <label
                  htmlFor="verify-email"
                  className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
                >
                  Email
                </label>
                <input
                  id="verify-email"
                  type="email"
                  autoComplete="email"
                  className="h-12 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 text-base text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/30"
                  ref={(el: HTMLInputElement | null) => {
                    emailRef.current = el;
                    if (el && !el.value) {
                      try {
                        const pending = sessionStorage.getItem(PENDING_VERIFICATION_EMAIL);
                        if (pending) el.value = pending;
                      } catch {
                        // sessionStorage unavailable; the user types the email.
                      }
                    }
                  }}
                />
              </div>

              <fieldset>
                <legend className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
                  Verification code
                </legend>
                <div className="flex gap-2" role="group" aria-label="6-digit verification code">
                  {digits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputsRef.current[index] = el;
                      }}
                      id={`otp-${index}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      aria-label={`Digit ${index + 1}`}
                      maxLength={2}
                      disabled={status === "verifying"}
                      value={digit}
                      onChange={(e) => setDigit(index, e.target.value)}
                      onKeyDown={(e) => onKeyDown(index, e)}
                      className="h-14 w-full rounded-lg border border-[#E2E8F0] bg-white text-center font-mono text-2xl font-bold text-[#0F172A] outline-none transition-colors focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/30 disabled:opacity-60"
                    />
                  ))}
                </div>
              </fieldset>

              {error && (
                <p role="alert" className="pl-1 text-sm font-semibold text-[#EF4444]">
                  {error}
                </p>
              )}
              {info && !error && (
                <p role="status" className="pl-1 text-sm font-medium text-[#0052FF]">
                  {info}
                </p>
              )}

              <Button
                type="submit"
                disabled={status === "verifying" || otp.length !== OTP_LENGTH}
                className="w-full"
              >
                {status === "verifying" ? "Verifying…" : "Verify email"}
              </Button>

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={cooldown > 0 || resending}
                  className="rounded text-sm font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:text-[#64748B] disabled:no-underline"
                >
                  {resending
                    ? "Sending…"
                    : cooldown > 0
                      ? `Resend code (${cooldown}s)`
                      : "Resend code"}
                </button>
                {(errorCode === "AUTH_OTP_EXPIRED" ||
                  errorCode === "AUTH_OTP_MAX_ATTEMPTS" ||
                  errorCode === "AUTH_OTP_NOT_FOUND") && (
                  <span className="text-xs font-medium text-[#64748B]">
                    Old codes are invalid after a resend.
                  </span>
                )}
              </div>

              <p className="border-t border-[#E2E8F0] pt-4 text-center text-xs font-medium text-[#64748B]">
                Wrong email or need a new code?{" "}
                <Link href="/register" className="font-semibold text-[#0052FF] hover:underline">
                  Register again
                </Link>{" "}
                or{" "}
                <Link href="/login" className="font-semibold text-[#0052FF] hover:underline">
                  sign in
                </Link>
                .
              </p>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
