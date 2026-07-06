"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useForm,
  useWatch,
  type FieldPath,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterValues } from "@/lib/validation/auth-schemas";
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
        className="mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        aria-describedby={error ? errId : undefined}
        className={`${inputBase} ${error ? "shadow-inset-deep" : ""}`}
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
    control,
    setValue,
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
      nationalId: "",
      accountType: "STUDENT",
      teacherInviteCode: "",
    },
  });

  const accountType = useWatch({ control, name: "accountType" });

  const onSubmit = async (values: RegisterValues) => {
    setFormError(null);
    try {
      await registerAction(values);
      router.replace("/login?registered=1");
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
          case "AUTH_TEACHER_INVITE_INVALID":
            setError("teacherInviteCode", { message: "Invalid teacher invite code." });
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

  const accountOptions: { value: "STUDENT" | "TEACHER"; label: string; hint: string }[] = [
    { value: "STUDENT", label: "Student", hint: "Take quizzes" },
    { value: "TEACHER", label: "Teacher", hint: "Create quizzes (invite required)" },
  ];

  return (
    <RedirectIfAuthenticated to="/">
      <main className="flex min-h-screen items-center justify-center bg-[#E0E5EC] px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 select-none text-center">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[#3D4852]">
            Create your account
          </h1>
          <p className="mt-2 text-sm font-medium text-[#6B7280]">
            Join Quizopia in seconds
          </p>
        </div>

        <div className="rounded-container bg-[#E0E5EC] p-8 shadow-extruded sm:p-10">
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
            {/* Account type toggle */}
            <fieldset>
              <legend className="mb-2 block pl-1 text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                Account type
              </legend>
              <div className="grid grid-cols-2 gap-3">
                {accountOptions.map((opt) => {
                  const selected = accountType === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setValue("accountType", opt.value, { shouldValidate: true })
                      }
                      className={`neumorphic-active-press flex flex-col items-start gap-0.5 rounded-button bg-[#E0E5EC] p-4 text-left outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] ${
                        selected
                          ? "shadow-inset-pressed text-[#6C63FF]"
                          : "shadow-extruded-small text-[#6B7280] hover:text-[#3D4852]"
                      }`}
                    >
                      <span className="text-sm font-bold">{opt.label}</span>
                      <span className="text-xs font-medium opacity-80">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <LabeledInput
                id="phone"
                label="Phone"
                name="phone"
                autoComplete="tel"
                placeholder="0901234567"
                error={errors.phone?.message}
                register={field}
              />
              <LabeledInput
                id="nationalId"
                label="National ID"
                name="nationalId"
                placeholder="001200012345"
                error={errors.nationalId?.message}
                register={field}
              />
            </div>

            {accountType === "TEACHER" && (
              <LabeledInput
                id="teacherInviteCode"
                label="Teacher invite code"
                name="teacherInviteCode"
                placeholder="Enter the code from your administrator"
                error={errors.teacherInviteCode?.message}
                register={field}
              />
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="neumorphic-active-press h-12 w-full rounded-button bg-[#6C63FF] text-sm font-semibold text-white shadow-extruded-small outline-none transition-all duration-300 hover:bg-[#8B84FF] active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm font-medium text-[#6B7280]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="rounded-inner font-semibold text-[#6C63FF] outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
      </main>
    </RedirectIfAuthenticated>
  );
}
