import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CommunityAdaptiveShell } from "@/components/community/CommunityAdaptiveShell";

/**
 * Public routes remain accessible to guests, but signed-in users use the
 * normal application shell rather than losing their account header/sidebar.
 * The auth-aware branch is client-side; metadata stays static and contains
 * no user-specific information.
 */
export const metadata: Metadata = {
  title: "Community — Quizopia",
  description: "Browse quizzes published publicly by the Quizopia community.",
};

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return <CommunityAdaptiveShell>{children}</CommunityAdaptiveShell>;
}
