"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useExamSessionDetailQuery } from "@/hooks/queries/use-exam-sessions";

/**
 * Legacy flat session URL (deprecated, Phase 1 Task B). examId cannot be
 * resolved client-side without a fetch, so this shim loads the session detail
 * (flat route still works) and replaces the URL with the canonical nested one.
 * Falls back to /exams when the session can't be resolved.
 */
export default function LegacyExamSessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const sessionIdNum = Number(sessionId);
  const validId = Number.isFinite(sessionIdNum);

  const { data, isError } = useExamSessionDetailQuery(sessionIdNum, validId);

  useEffect(() => {
    if (data) router.replace(`/exams/${data.examId}/sessions/${data.id}`);
    else if (isError || !validId) router.replace("/exams");
  }, [data, isError, validId, router]);

  return (
    <div role="status" aria-busy="true" aria-label="Redirecting to session" className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#E2E8F0] border-t-[#0052FF]" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-[#64748B]">Redirecting to the session…</p>
    </div>
  );
}
