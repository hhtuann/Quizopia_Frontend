"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  importMarkdownQuestions,
  importQuestions,
  type ImportResponse,
} from "@/lib/api/question-import";

/**
 * Import-questions mutation. On success it invalidates the bank's question-list
 * query cache so the FE5 `useBankQuestionsQuery` refetches (key prefix
 * `["question-banks", bankId, "questions"]` matches
 * `["question-banks", bankId, "questions", params]` for any filter params).
 *
 * NOTE: `onSuccess` runs for BOTH fully-valid and partial-success (200 with
 * `errors[]`) outcomes — the cache must refresh in either case. File-level
 * failures (4xx ApiError) reject and never reach `onSuccess`.
 */
export function useImportQuestionsMutation(bankId: number) {
  const queryClient = useQueryClient();
  return useMutation<ImportResponse, Error, File>({
    mutationFn: (file: File) => importQuestions(bankId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["question-banks", bankId, "questions"],
      });
    },
  });
}

/**
 * Markdown import mutation (P2-C). On success it refreshes the bank's
 * question list AND the bank list (question counts) — same cache keys as the
 * Excel mutation plus `["question-banks"]` because the bank card shows a
 * question count.
 */
export function useImportMarkdownQuestionsMutation(bankId: number) {
  const queryClient = useQueryClient();
  return useMutation<ImportResponse, Error, string>({
    mutationFn: (markdown: string) => importMarkdownQuestions(bankId, markdown),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["question-banks", bankId, "questions"],
      });
      void queryClient.invalidateQueries({ queryKey: ["question-banks"] });
    },
  });
}
