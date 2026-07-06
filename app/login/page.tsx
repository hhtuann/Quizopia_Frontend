"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginValues } from "@/lib/validation/auth-schemas";
import { useAuth } from "@/hooks/useAuth";
import { RedirectIfAuthenticated } from "@/components/auth/RedirectIfAuthenticated";
import type { NormalizedApiError } from "@/lib/api";

const inputBase =
  "w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-center gap-1.5 pl-1 text-xs font-semibold text-[#3D4852]"
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
    <main className="flex min-h-screen items-center justify-center bg-[#E0E5EC] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 select-none text-center">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#3D4852]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Sign in to your Quizopia account
          </p>
        </div>

        <div className="rounded-container bg-[#E0E5EC] p-8 shadow-extruded sm:p-10">
          {justRegistered && (
            <div
              role="status"
              className="mb-6 rounded-button bg-[#E0E5EC] p-4 text-sm font-semibold text-[#38B2AC] shadow-inset-pressed"
            >
              Registration successful — you can sign in now.
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-button bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep"
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
                className="mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]"
              >
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="you@example.com"
                aria-invalid={!!errors.identifier}
                aria-describedby={errors.identifier ? "identifier-error" : undefined}
                className={`${inputBase} ${errors.identifier ? "shadow-inset-deep" : ""}`}
                {...field("identifier")}
              />
              <FieldError id="identifier-error" message={errors.identifier?.message} />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className={`${inputBase} ${errors.password ? "shadow-inset-deep" : ""}`}
                {...field("password")}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="neumorphic-active-press h-12 w-full rounded-button bg-[#6C63FF] text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-[#6B7280]">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="rounded-inner font-semibold text-[#6C63FF] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
            >
              Create one
            </Link>
          </p>
        </div>
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
