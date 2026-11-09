"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import AppShell from "@/components/layout/AppShell";
import { AuthLoader } from "@/components/auth/RequireAuth";
import { PublicHeader } from "@/components/layout/PublicHeader";

/**
 * Community browsing is public, but public chrome must not replace the
 * authenticated app shell. Wait for the existing refresh-token bootstrap
 * before choosing a shell, preventing a false Log in/Register flash.
 *
 * No RequireAuth: guests must be able to read the catalog and quiz details.
 * Backend-owned access rules remain authoritative for saved/fork actions.
 */
export function CommunityAdaptiveShell({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === "loading") return <AuthLoader />;

  const content = (
    <div className="mx-auto w-full max-w-6xl">{children}</div>
  );

  if (status === "authenticated") {
    return <AppShell>{content}</AppShell>;
  }

  return (
    <div className="app-shell flex flex-col bg-[#FAFAFA] text-[#0F172A]">
      <PublicHeader />
      <main className="w-full flex-1 px-[var(--page-gutter)] pb-16 pt-6 sm:pt-8">
        {content}
      </main>
    </div>
  );
}
