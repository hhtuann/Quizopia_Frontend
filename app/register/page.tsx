"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterValues } from "@/lib/validation/auth-schemas";
import { Button, Card, Input } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/hooks/useAuth";
import { RedirectIfAuthenticated } from "@/components/auth/RedirectIfAuthenticated";
import type { NormalizedApiError } from "@/lib/api";

/** sessionStorage key holding the email pending verification (never the OTP). */
export const PENDING_VERIFICATION_EMAIL = "quizopia.pendingVerificationEmail";

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

function LabeledInput({
  id,
  label,
  name,
  type = "text",
  placeholder,
  autoComplete,
  error,
  register,
}: {
  id: string;
  label: string;
  name: FieldPath<RegisterValues>;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
  register: UseFormRegister<RegisterValues>;
}) {
  const errId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block pl-1 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]"
      >
        {label}
      </label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        className={cn(error && "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]")}
        {...register(name)}
      />
      <FieldError id={errId} message={error} />
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register: registerAction } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register: field,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      displayName: "",
      phone: "",
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null);
    try {
      const created = await registerAction(values);
      // Identity-M1: every new account is STUDENT and must verify an email
      // OTP before login. Carry the address in sessionStorage (not the URL)
      // so the OTP screen can prefill and the browser history stays PII-free.
      try {
        sessionStorage.setItem(PENDING_VERIFICATION_EMAIL, created.email);
      } catch {
        // sessionStorage unavailable (private mode): the OTP screen falls
        // back to asking for the email.
      }
      router.replace("/verify-email");
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "api") {
        switch (norm.code) {
          case "AUTH_USERNAME_ALREADY_EXISTS":
            setError("username", { message: "This username is already taken." });
            break;
          case "AUTH_EMAIL_ALREADY_EXISTS":
            setError("email", { message: "This email is already registered." });
            break;
          case "AUTH_VALIDATION_ERROR":
            setFormError("Please check the highlighted fields and try again.");
            break;
          default:
            setFormError(norm.message || "Registration failed. Please try again.");
        }
      } else if (norm?.kind === "network") {
        setFormError("Network error — check your connection and try again.");
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <RedirectIfAuthenticated to="/">
      <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-12">
        <div className="w-full max-w-lg">
          <div className="mb-8 select-none text-center">
            <h1 className="font-display text-3xl tracking-tight text-[#0F172A]">
              Create your <span className="gradient-text">account</span>
            </h1>
            <p className="mt-2 text-sm font-medium text-[#64748B]">
              Join Quizopia as a learner in seconds
            </p>
          </div>

          <Card variant="elevated" className="p-8 sm:p-10">
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
              <LabeledInput
                id="username"
                label="Username"
                name="username"
                autoComplete="username"
                placeholder="johndoe"
                error={errors.username?.message}
                register={field}
              />
              <LabeledInput
                id="email"
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                error={errors.email?.message}
                register={field}
              />
              <LabeledInput
                id="password"
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                error={errors.password?.message}
                register={field}
              />
              <LabeledInput
                id="displayName"
                label="Display name"
                name="displayName"
                autoComplete="name"
                placeholder="John Doe"
                error={errors.displayName?.message}
                register={field}
              />
              <LabeledInput
                id="phone"
                label="Phone"
                name="phone"
                autoComplete="tel"
                placeholder="0901234567"
                error={errors.phone?.message}
                register={field}
              />

              <p className="pl-1 text-xs font-medium text-[#64748B]">
                Every account starts as a learner. You can register as a teacher
                from the app menu once you&apos;re signed in.
              </p>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Creating account…" : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm font-medium text-[#64748B]">
              Already have an account?{" "}
              <Link
                href="/login"
                className="rounded font-semibold text-[#0052FF] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
              >
                Sign in
              </Link>
            </p>
          </Card>
        </div>
      </main>
    </RedirectIfAuthenticated>
  );
}
