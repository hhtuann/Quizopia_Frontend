"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { authApi } from "@/lib/auth";
import { useAuthStore } from "@/lib/auth";

/**
 * Identity-M1 OAuth callback. The backend redirected here with
 * `?code=<opaque one-time code>` (never a token). This page exchanges the
 * code for the Quizopia session (access token in memory + HttpOnly refresh
 * cookie) and routes home. `?error=...` renders a retry state instead.
 */
function OAuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const [phase, setPhase] = useState<"exchanging" | "done" | "failed">(
    code ? "exchanging" : "failed",
  );
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const token = await authApi.exchangeOauthCode(code);
        useAuthStore.getState().setAccessToken(token.accessToken);
        const me = await authApi.me();
        useAuthStore.getState().setUser(me);
        setPhase("done");
        router.replace("/");
      } catch {
        setPhase("failed");
      }
    })();
  }, [code, router]);

  if (phase === "exchanging") {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-10 text-center">
        <span
          className="h-10 w-10 animate-spin rounded-full border-4 border-[#E2E8F0] border-t-[#0052FF]"
          aria-hidden="true"
        />
        <p className="text-lg font-bold text-[#0F172A]">Signing you in…</p>
        <p className="text-sm font-medium text-[#64748B]">
          Finishing the Google sign-in handshake.
        </p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="text-lg font-bold text-[#0F172A]">Signed in!</p>
        <p className="text-sm font-medium text-[#64748B]">Taking you to Quizopia…</p>
      </div>
    );
  }

  const reason =
    oauthError === "AUTH_OAUTH_EMAIL_CONFLICT"
      ? "An account with this email already exists. Sign in with your password instead — linking Google comes with the profile feature."
      : oauthError === "AUTH_OAUTH_EMAIL_NOT_VERIFIED"
        ? "Google reports your email as not verified. Verify it in your Google account and try again."
        : "The Google sign-in could not be completed. The link may have expired — please try again.";

  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EF4444]/10 text-[#EF4444]">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </span>
      <p className="text-lg font-bold text-[#0F172A]">Sign-in failed</p>
      <p className="max-w-sm text-sm font-medium text-[#64748B]">{reason}</p>
      <div className="flex gap-3">
        <Link href="/login">
          <Button variant="primary">Back to sign in</Button>
        </Link>
        <Link href="/register">
          <Button variant="outline">Create an account</Button>
        </Link>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
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
            <OAuthCallbackInner />
          </Suspense>
        </Card>
      </div>
    </main>
  );
}
