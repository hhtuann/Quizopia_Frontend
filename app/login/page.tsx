"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginValues } from "@/lib/validation/auth-schemas";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { RedirectIfAuthenticated } from "@/components/auth/RedirectIfAuthenticated";
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    try {
      await login(values);
      router.replace("/");
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "api") {
        switch (norm.code) {
          case "AUTH_INVALID_CREDENTIALS":
            setFormError("Invalid username/email or password.");
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
          {justRegistered && (
            <div
              role="status"
              className="mb-6 rounded-lg border border-[#10B981]/30 bg-[#10B981]/5 p-4 text-sm font-semibold text-[#10B981]"
            >
              Registration successful — you can sign in now.
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
              <span>{formError}</span>
            </div>
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
