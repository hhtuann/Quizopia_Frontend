"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNextDraft,
  getExamDetail,
  listMyExams,
  publishExam,
  updateDraftComposition,
  type CreateExamVersionRequest,
  type ExamListParams,
  type PublishExamRequest,
  type UpdateDraftCompositionRequest,
} from "@/lib/api/exams";
import { listPurposes } from "@/lib/api/exam-purposes";
import type { NormalizedApiError } from "@/lib/api";

/**
 * Exams list query — filter-scoped key + `keepPreviousData` (no flicker on
 * page/search/filter change). Mirrors `useQuestionBanksQuery`.
 */
export function useExamsQuery(params: ExamListParams) {
  return useQuery({
    queryKey: ["exams", params],
    queryFn: () => listMyExams(params),
    placeholderData: keepPreviousData,
  });
}

/** Exam-purpose dropdown query — purposes rarely change, so a 5-minute staleTime. */
export function useExamPurposesQuery() {
  return useQuery({
    queryKey: ["exam-purposes"],
    queryFn: () => listPurposes(),
    staleTime: 5 * 60_000,
  });
}

/** Teacher editor view for one exam. `enabled` guards against an invalid id. */
export function useExamEditorQuery(examId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["exams", examId, "editor"],
    queryFn: () => getExamDetail(examId),
    enabled,
  });
}

/**
 * PUT draft composition. On success the editor refetches (local state resyncs
 * from the saved server snapshot). On a 409 (concurrent modification / not a
 * draft) the editor also refetches — but does NOT auto-retry/overwrite; the
 * caller surfaces the conflict and the teacher reviews the updated draft.
 */
export function useUpdateDraftCompositionMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateDraftCompositionRequest) =>
      updateDraftComposition(examId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "editor"] });
    },
    onError: (error) => {
      const norm = error as unknown as NormalizedApiError;
      if (
        norm?.kind === "api" &&
        (norm.code === "EXAM_CONCURRENT_MODIFICATION" ||
          norm.code === "EXAM_VERSION_NOT_DRAFT")
      ) {
        queryClient.invalidateQueries({ queryKey: ["exams", examId, "editor"] });
      }
    },
  });
}

/**
 * Publish the current DRAFT (immutable snapshot). On success, invalidates the
 * editor + the exams list so the editor refetches (draft→PUBLISHED,
 * publishedVersions +1, status READY). Errors are NOT auto-refetched here —
 * the caller decides (e.g., refetch on 409 EXAM_PUBLISH_CONFLICT, no retry).
 */
export function usePublishExamMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req?: PublishExamRequest) => publishExam(examId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "editor"] });
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}

/**
 * Create the next DRAFT (clones the latest PUBLISHED version when no body).
 * On success, invalidates the editor + list so the new draft appears. Errors
 * are surfaced to the caller (e.g., 409 EXAM_VERSION_NOT_FOUND).
 */
export function useCreateNextDraftMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req?: CreateExamVersionRequest) => createNextDraft(examId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "editor"] });
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}
