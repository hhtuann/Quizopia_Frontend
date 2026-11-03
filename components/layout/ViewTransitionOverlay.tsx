"use client";

import { QuizopiaLogo } from "./QuizopiaLogo";
import type { ViewRole } from "@/lib/view/store";

const COPY: Record<ViewRole, { title: string; subtitle: string }> = {
  TEACHER: { title: "Đang chuyển sang màn Giáo viên...", subtitle: "Đang chuẩn bị không gian làm việc của bạn" },
  STUDENT: { title: "Đang chuyển sang màn Học sinh...", subtitle: "Đang chuẩn bị không gian làm việc của bạn" },
};

/**
 * Full-screen cover shown while switching Teacher ↔ Student view. Opaque and
 * topmost so the outgoing view never flashes through; the shell unmounts it
 * once navigation + minimum data of the target view settled (or the watchdog
 * reports a failure with a retry action). Renders nothing when idle.
 */
export function ViewTransitionOverlay({
  to,
  failed = false,
  onRetry,
}: {
  to: ViewRole;
  failed?: boolean;
  onRetry: () => void;
}) {
  const copy = COPY[to];
  return (
    <div
      role={failed ? "alert" : "status"}
      aria-busy={!failed}
      aria-label={failed ? "Chuyển chế độ thất bại" : copy.title}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[#FAFAFA] px-6 text-center"
    >
      <QuizopiaLogo withWordmark />
      {failed ? (
        <>
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-semibold text-[#EF4444]">Không thể chuyển chế độ. Vui lòng thử lại.</p>
            <p className="text-xs font-medium text-[#64748B]">{copy.title}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] px-6 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)] outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,82,255,0.35)] hover:brightness-110 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
          >
            Thử lại
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* Same accent-ring spinner as the auth loader (RequireAuth). */}
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0052FF]" />
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-semibold text-[#0F172A]">{copy.title}</p>
            <p className="text-xs font-medium text-[#64748B]">{copy.subtitle}</p>
          </div>
        </div>
      )}
    </div>
  );
}
