import { redirect } from "next/navigation";

/**
 * Legacy standalone session-create page (deprecated, Phase 1 Task B) —
 * sessions are created from a published exam at /exams/{examId}?tab=sessions.
 */
export default function LegacyNewExamSessionPage() {
  redirect("/exams");
}
