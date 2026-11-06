"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginValues } from "@/lib/validation/auth-schemas";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { RedirectIfAuthenticated } from "@/components/auth/RedirectIfAuthenticated";
import { StaleSessionError } from "@/lib/auth/store";
import { authApi } from "@/lib/auth";
import { PENDING_VERIFICATION_EMAIL } from "@/app/register/page";
import type { NormalizedApiError } from "@/lib/api";

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

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.193-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
      />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const justVerified = searchParams.get("verified") === "1";
  const passwordChanged = searchParams.get("passwordChanged") === "1";
  const passwordReset = searchParams.get("passwordReset") === "1";
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerificationEmail, setNeedsVerificationEmail] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  useEffect(() => {
    // Identity-M1: only offer Google SSO when the backend has credentials.
    let cancelled = false;
    authApi
      .providers()
      .then((p) => {
        if (!cancelled) setGoogleEnabled(p.googleEnabled);
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    setNeedsVerificationEmail(null);
    try {
      await login(values);
      // P2-D: return to the deep link that triggered the login (validated as
      // an internal path), defaulting to home.
      router.replace(returnTo ?? "/");
    } catch (err) {
      if (err instanceof StaleSessionError) {
        // A newer sign-in attempt superseded this one — stay quiet; the newer
        // attempt owns the UI and any error surface.
        return;
      }
      const norm = err as NormalizedApiError;
      if (norm?.kind === "api") {
        switch (norm.code) {
          case "AUTH_INVALID_CREDENTIALS":
            setFormError("Invalid username/email or password.");
            break;
          case "AUTH_EMAIL_NOT_VERIFIED":
            // Identity-M1: verified accounts only. Route to the OTP screen.
            setNeedsVerificationEmail(
              values.identifier.includes("@") ? values.identifier : "",
            );
            setFormError("Your email is not verified yet. Enter the code we sent you.");
            break;
          case "AUTH_ACCOUNT_LOCKED":
            setFormError("Your account is temporarily locked. Please try again later.");
            break;
          case "AUTH_ACCOUNT_DISABLED":
            setFormError("Your account has been disabled.");
            break;
          case "AUTH_ACCOUNT_PENDING":
            setFormError("Your account is pending activation.");
            break;
          case "AUTH_VALIDATION_ERROR":
            setError("identifier", { message: "Please check your credentials." });
            break;
          default:
            setFormError(norm.message || "Unable to sign in. Please try again.");
        }
      } else if (norm?.kind === "network") {
        setFormError("Network error — check your connection and try again.");
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
            Welcome <span className="gradient-text">back</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-[#64748B]">
            Sign in to your Quizopia account
          </p>
        </div>

        <Card variant="elevated" className="p-8 sm:p-10">
          {passwordReset && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-semibold text-[#10B981]"
            >
              Your password was reset. Sign in with your new password.
            </div>
          )}
          {passwordChanged && (
            <div role="status" className="mb-6 flex items-start gap-2 rounded-lg border border-[#15803D]/30 bg-[#15803D]/5 p-4 text-sm font-medium text-[#15803D]">
              Your password was changed. All sessions were signed out — sign in with your new password.
            </div>
          )}
          {justVerified && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-semibold text-[#10B981]"
            >
              Email verified — you can sign in now.
            </div>
          )}

          {!justVerified && justRegistered && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-semibold text-[#10B981]"
            >
              Registration successful — check your email for a verification code.
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-4 text-sm font-medium text-[#EF4444]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                />
              </svg>
              <span>
                {formError}{" "}
                {needsVerificationEmail !== null && (
                  <Link
                    href="/verify-email"
                    onClick={() => {
                      if (needsVerificationEmail) {
                        try {
                          sessionStorage.setItem(PENDING_VERIFICATION_EMAIL, needsVerificationEmail);
                        } catch {
                          // sessionStorage unavailable; the page asks for it.
                        }
                      }
                    }}
                    className="font-bold underline"
                  >
                    Verify now
                  </Link>
                )}
              </span>
            </div>
          )}

          {googleEnabled && (
            <>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL ?? ""}/oauth2/authorization/google`}
                onClick={() => {
                  // P2-D: keep the deep-link continuation across the OAuth
                  // round-trip (consumed by the callback page).
                  try {
                    sessionStorage.setItem("auth.returnTo", returnTo ?? "/");
                  } catch {
                    // sessionStorage unavailable — continuation falls back to home.
                  }
                }}
                className="mb-2 flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#E2E8F0] bg-white font-semibold text-[#0F172A] outline-none transition-colors hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
              >
                <GoogleMark className="h-5 w-5" />
                Continue with Google
              </a>
              <div className="mb-6 mt-4 flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-[#E2E8F0]" />
                <span className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">or</span>
                <span className="h-px flex-1 bg-[#E2E8F0]" />
              </div>
            </>
          )}

          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
              >
                Username or Email
              </label>
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com"
                aria-invalid={!!errors.identifier}
                aria-describedby={errors.identifier ? "identifier-error" : undefined}
                className={cn(errors.identifier && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
                {...field("identifier")}
              />
              <FieldError id="identifier-error" message={errors.identifier?.message} />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
              >
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={cn(errors.password && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
                {...field("password")}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-[#64748B]">
            <Link
              href="/forgot-password"
              className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
            >
              Forgot password?
            </Link>
          </p>
          <p className="mt-2 text-center text-sm font-medium text-[#64748B]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
            >
              Create one
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  // `useSearchParams` must be inside a Suspense boundary for static prerender.
  return (
    <RedirectIfAuthenticated to="/">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </RedirectIfAuthenticated>
  );
}
