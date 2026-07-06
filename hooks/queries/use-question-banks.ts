"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  listBankQuestions,
  listMyBanks,
  type BankListParams,
  type BankQuestionListParams,
} from "@/lib/api/question-banks";

/**
 * TanStack Query hooks for the question-bank endpoints.
 *
 * - Query keys include the full filter params, so changing page/search/type/
 *   status produces a new key → automatic refetch.
 * - `placeholderData: keepPreviousData` keeps the previous result visible
 *   while the next page/search resolves (no white-flicker between states).
 *
 * Pass a STABLE `params` object (e.g. via `useMemo`) so the key doesn't change
 * every render.
 */
export function useQuestionBanksQuery(params: BankListParams) {
  return useQuery({
    queryKey: ["question-banks", params],
    queryFn: () => listMyBanks(params),
    placeholderData: keepPreviousData,
  });
}

export function useBankQuestionsQuery(
  bankId: number,
  params: BankQuestionListParams,
  enabled = true
) {
  return useQuery({
    queryKey: ["question-banks", bankId, "questions", params],
    queryFn: () => listBankQuestions(bankId, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}
