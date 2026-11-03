import { redirect } from "next/navigation";

/**
 * Legacy standalone exam-sessions list (deprecated, Phase 1 Task B) — sessions
 * now live under each exam's Sessions tab.
 */
export default function LegacyExamSessionsPage() {
  redirect("/exams");
}
