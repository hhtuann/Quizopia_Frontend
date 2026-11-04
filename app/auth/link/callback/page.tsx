"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";

/**
 * Review M1-06: result page of the authenticated Google LINKING flow. The
 * backend redirected here with `?status=success|error` (never a token). A
 * successful link refreshes the identity in place so the User Menu reflects
 * the linked state without a re-login.
 */
function LinkCallbackInner() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const errorCode = searchParams.get("error");
  const { refreshUser } = useAuth() as { refreshUser?: () => Promise<unknown> };
  const refreshed = useRef(false);

  useEffect(() => {
    if (status !== "success" || refreshed.current) return;
    refreshed.current = true;
    // M1 keeps refreshUser internal; the menu re-reads on next mount. Best
    // effort: refresh when the provider exposes it (M2 always does).
    void refreshUser?.();
  }, [status, refreshUser]);

  if (status === "success") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#10B981]/10 text-[#10B981]">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </span>
        <p className="text-lg font-bold text-[#0F172A]">Google account linked!</p>
        <p className="max-w-sm text-sm font-medium text-[#64748B]">
          You can now sign in with either your password or Google — both resolve
          to this same Quizopia account.
        </p>
        <Link href="/">
          <Button variant="primary">Back to the app</Button>
        </Link>
      </div>
    );
  }

  const reason =
    errorCode === "AUTH_OAUTH_EMAIL_CONFLICT"
      ? "That Google account (or its email) is already attached to another Quizopia account. Sign in with that account instead, or contact support."
      : "The linking request expired or could not be verified. Please try again.";

  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/10 text-[#EF4444]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </span>
      <p className="text-lg font-bold text-[#0F172A]">Linking failed</p>
      <p className="max-w-sm text-sm font-medium text-[#64748B]">{reason}</p>
      <div className="flex gap-3">
        <Link href="/">
          <Button variant="outline">Back to the app</Button>
        </Link>
      </div>
    </div>
  );
}

export default function GoogleLinkCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4 py-12">
      <div className="w-full max-w-lg">
        <Card variant="elevated" className="p-8 sm:p-10">
          <Suspense
            fallback={
              <div role="status" className="flex justify-center py-10">
                <span
                  className="h-10 w-10 animate-spin rounded-full border-4 border-[#E2E8F0] border-t-[#0052FF]"
                  aria-hidden="true"
                />
              </div>
            }
          >
            <LinkCallbackInner />
          </Suspense>
        </Card>
      </div>
    </main>
  );
}
