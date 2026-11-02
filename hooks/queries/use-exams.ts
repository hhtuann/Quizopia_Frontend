"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveExam,
  createExam,
  duplicateExam,
  getExamDetail,
  listMyExams,
  publishExam,
  updateComposition,
  type CreateExamRequest,
  type ExamListParams,
  type PublishExamRequest,
  type UpdateCompositionRequest,
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

/** Teacher editor/management view for one exam. `enabled` guards against an invalid id. */
export function useExamQuery(examId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["exams", examId, "editor"],
    queryFn: () => getExamDetail(examId),
    enabled,
  });
}

/**
 * PUT composition (DRAFT only). On success the response carries the NEW
 * `examVersion` + pinned snapshots — it is written straight into the editor
 * cache (no refetch flicker) and the exams list is invalidated. On a 409
 * (EXAM_CONCURRENT_MODIFICATION / not a draft) the editor refetches — the
 * caller surfaces the conflict; no auto-retry/overwrite.
 */
export function useUpdateCompositionMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateCompositionRequest) =>
      updateComposition(examId, req),
    onSuccess: (data) => {
      queryClient.setQueriesData(
        { queryKey: ["exams", examId, "editor"] },
        data
      );
      queryClient.invalidateQueries({ queryKey: ["exams"] });
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
 * Create an exam (workspace-aware). On success invalidates the exams list.
 */
export function useCreateExamMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateExamRequest) => createExam(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}

/**
 * Publish the DRAFT (immutable snapshot — one-way). `expectedExamVersion` is
 * optional; a mismatch/concurrent publish → 409 EXAM_PUBLISH_CONFLICT (the
 * caller surfaces the notice; no auto-retry).
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

/** Duplicate the exam → new DRAFT copy. Invalidates the exams list. */
export function useDuplicateExamMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => duplicateExam(examId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}

/**
 * Archive the exam → editor response with status ARCHIVED. 409
 * EXAM_ARCHIVE_CONFLICT while sessions are SCHEDULED/OPEN (the caller shows
 * the "close scheduled/open sessions first" notice).
 */
export function useArchiveExamMutation(examId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => archiveExam(examId),
    onSuccess: (data) => {
      queryClient.setQueriesData(
        { queryKey: ["exams", examId, "editor"] },
        data
      );
      queryClient.invalidateQueries({ queryKey: ["exams"] });
    },
  });
}
