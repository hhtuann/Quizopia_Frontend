"use client";

import { AnimatePresence, motion } from "framer-motion";
import { QuizopiaLogo } from "@/components/layout/QuizopiaLogo";

/**
 * Identity-M2 view-transition overlay. Shown while the app switches between
 * the Student and Teacher views: real Quizopia logo, the mandated Vietnamese
 * message, and no artificial delay — the caller closes it as soon as the new
 * view's navigation settles, with an error fallback that always clears it.
 */
export function ViewTransitionOverlay({
  open,
  message,
}: {
  open: boolean;
  message: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="view-transition"
          role="status"
          aria-live="polite"
          aria-label={message}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-[#FAFAFA]"
        >
          <QuizopiaLogo withWordmark />
          <div className="flex items-center gap-3">
            <span
              className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#E2E8F0] border-t-[#0052FF]"
              aria-hidden="true"
            />
            <p className="text-base font-semibold text-[#0F172A]">{message}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const TEACHER_TRANSITION_MESSAGE = "Đang chuyển sang màn Giáo viên...";
export const STUDENT_TRANSITION_MESSAGE = "Đang chuyển sang màn Học sinh...";
