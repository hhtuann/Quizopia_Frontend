"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { changePassword, getAccountSecurity, type AccountSecurity } from "@/lib/api/account";
import { passwordChangeSchema, type PasswordChangeValues } from "@/lib/validation/password-schema";
import { beginSession, invalidateSession, isCurrentSession, sessionGeneration } from "@/lib/auth/store";
import type { NormalizedApiError } from "@/lib/api";

export function SecurityPanel() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [capability, setCapability] = useState<AccountSecurity | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<PasswordChangeValues>({ currentPassword: "", newPassword: "", confirmPassword: "" });

  useEffect(() => {
    let cancelled = false;
    getAccountSecurity().then((c) => { if (!cancelled) { setCapability(c); setState("ready"); } })
        .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = passwordChangeSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password rules and try again.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const generation = sessionGeneration();
    try {
      await changePassword(parsed.data);
      if (!isCurrentSession(generation)) return;
    } catch (err) {
      if (!isCurrentSession(generation)) return;
      setSubmitting(false);
      const failure = err as NormalizedApiError;
      if (failure?.kind === "network") setError("Network error — check your connection and try again.");
      else if (failure?.kind === "api" && failure.code === "AUTH_ACCOUNT_LOCKED") setError("Too many attempts. Your account is temporarily locked; try again later.");
      else if (failure?.kind === "api" && failure.code === "AUTH_INVALID_CREDENTIALS") setError("Your current password is incorrect.");
      else if (failure?.kind === "api" && failure.code === "AUTH_ACCESS_TOKEN_INVALID") setError("Your session expired. Please sign in and try again.");
      else setError("Could not change your password. Please try again.");
      return;
    }
    // Server revoked every session: drop local state synchronously and go to login.
    invalidateSession();
    beginSession();
    window.location.assign("/login?passwordChanged=1");
  }

  if (state === "loading") return <p role="status">Loading your security settings…</p>;
  if (state === "error") return (
      <Card className="p-6">
        <p role="alert" className="text-sm text-[#B91C1C]">Your security settings could not be loaded. Refresh the page to try again.</p>
      </Card>
  );
  if (!capability?.canChangePassword) return (
      <Card className="space-y-3 p-6">
        <h2 className="text-lg font-semibold text-[#0F172A]">Password</h2>
        <p className="text-sm text-[#64748B]">
          {capability?.googleLinked
              ? "You sign in with Google. Your account does not use a Quizopia password, so there is no password to change here."
              : "A Quizopia password change is not available for this account. Sign in with your usual method, or contact support if you believe this is a mistake."}
        </p>
      </Card>
  );

  const rules = [
    { label: "At least 8 characters", ok: form.newPassword.length >= 8 },
    { label: "At most 128 characters", ok: form.newPassword.length <= 128 },
    { label: "Different from your current password", ok: form.newPassword.length > 0 && form.newPassword !== form.currentPassword },
    { label: "Both new password entries match", ok: form.newPassword.length > 0 && form.newPassword === form.confirmPassword },
  ];

  return (
      <Card className="space-y-5 p-6">
        <div>
          <h2 className="text-lg font-semibold text-[#0F172A]">Password</h2>
          <p className="mt-2 text-sm text-[#64748B]">
            {capability.googleLinked
                ? "This account also has a Quizopia password alongside Google sign-in. Changing it signs you out everywhere, including this browser."
                : "Changing your password signs you out everywhere, including this browser."}
          </p>
        </div>
        <form onSubmit={submit} aria-busy={submitting} className="space-y-5">
          <div>
            <label htmlFor="currentPassword" className="mb-2 block text-sm font-medium text-[#0F172A]">Current password</label>
            <div className="flex gap-2">
              <input id="currentPassword" type={showCurrent ? "text" : "password"} autoComplete="current-password"
                     disabled={submitting} value={form.currentPassword}
                     onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                     className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#0F172A] focus:border-[#0052FF] focus:outline-none" />
              <Button type="button" variant="outline" aria-pressed={showCurrent}
                      onClick={() => setShowCurrent(!showCurrent)}>{showCurrent ? "Hide" : "Show"}</Button>
            </div>
          </div>
          <div>
            <label htmlFor="newPassword" className="mb-2 block text-sm font-medium text-[#0F172A]">New password</label>
            <div className="flex gap-2">
              <input id="newPassword" type={showNew ? "text" : "password"} autoComplete="new-password"
                     disabled={submitting} value={form.newPassword}
                     onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                     aria-describedby="password-rules"
                     className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#0F172A] focus:border-[#0052FF] focus:outline-none" />
              <Button type="button" variant="outline" aria-pressed={showNew}
                      onClick={() => setShowNew(!showNew)}>{showNew ? "Hide" : "Show"}</Button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-[#0F172A]">Confirm new password</label>
            <input id="confirmPassword" type={showNew ? "text" : "password"} autoComplete="new-password"
                   disabled={submitting} value={form.confirmPassword}
                   onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                   aria-describedby="password-rules" className="w-full rounded-lg border border-[#E2E8F0] px-3 py-2 text-[#0F172A] focus:border-[#0052FF] focus:outline-none" />
          </div>
          <ul id="password-rules" className="space-y-1 text-sm">
            {rules.map((rule) => (
                <li key={rule.label} aria-label={rule.label} className={rule.ok ? "text-[#15803D]" : "text-[#64748B]"}>
                  {rule.ok ? "✓" : "•"} {rule.label}
                </li>
            ))}
          </ul>
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[#B91C1C]">{error}</p>}
          <p className="text-xs text-[#64748B]">For your security, every signed-in device — including this one — will be signed out once the password changes.</p>
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting || rules.some((rule) => !rule.ok)}>
              {submitting ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </Card>
  );
}
