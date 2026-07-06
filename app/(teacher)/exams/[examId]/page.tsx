"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useExamEditorQuery } from "@/hooks/queries/use-exams";
import { ExamEditor } from "@/components/teacher/exam-editor/ExamEditor";
import type { NormalizedApiError } from "@/lib/api";

export default function ExamDetailPage() {
  const { examId } = useParams<{ examId: string }>();
  const examIdNum = Number(examId);
  const validId = Number.isFinite(examIdNum);

  const { data, isPending, isError, error } = useExamEditorQuery(examIdNum, validId);

  if (!validId) {
    return <NotFound />;
  }
  if (isPending) {
    return <Skeleton />;
  }
  if (isError) {
    return <LoadError error={error as unknown as NormalizedApiError | undefined} />;
  }
  if (!data) {
    return <NotFound />;
  }
  return <ExamEditor data={data} />;
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading exam" className="space-y-4">
      <div className="h-8 w-64 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small" />
      <div className="h-40 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
      <div className="h-40 animate-pulse rounded-container bg-[#E0E5EC] shadow-extruded" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#E0E5EC] text-[#6B7280] shadow-inset-deep">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          className="h-7 w-7"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
          />
        </svg>
      </div>
      <p className="font-display text-lg font-bold text-[#3D4852]">Exam not found</p>
      <p className="mt-1 text-sm text-[#6B7280]">
        This exam may have been removed or you don&apos;t have access to it.
      </p>
      <Link
        href="/exams"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
      >
        Back to exams
      </Link>
    </div>
  );
}

function LoadError({ error }: { error: NormalizedApiError | undefined }) {
  let message: string;
  if (error?.kind === "api") {
    switch (error.code) {
      case "EXAM_NOT_FOUND":
        message = "This exam could not be found.";
        break;
      case "EXAM_ACCESS_DENIED":
      case "EXAM_TEACHER_PROFILE_NOT_FOUND":
        message = "You don't have access to this exam.";
        break;
      case "AUTH_ACCESS_TOKEN_INVALID":
        message = "Your session has expired — please sign in again.";
        break;
      default:
        message = error.message || "Couldn't load the exam.";
    }
  } else if (error?.kind === "network") {
    message = "Network error — check your connection and try again.";
  } else {
    message = "Something went wrong. Please try again.";
  }
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-container bg-[#E0E5EC] p-5 text-sm font-medium text-[#3D4852] shadow-extruded"
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
      <div>
        <span>{message}</span>
        <Link
          href="/exams"
          className="mt-3 inline-flex h-11 items-center justify-center rounded-2xl bg-[#E0E5EC] px-5 text-sm font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]"
        >
          Back to exams
        </Link>
      </div>
    </div>
  );
}
