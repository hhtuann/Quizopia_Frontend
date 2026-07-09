"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSubject,
  getGradeLevels,
  listSubjects,
  updateSubject,
  updateSubjectStatus,
  type AcademicStatus,
  type CreateSubjectRequest,
  type SubjectListParams,
  type UpdateSubjectRequest,
} from "@/lib/api/subjects";

/**
 * Subjects dropdown query. Subjects change rarely, so a generous staleTime
 * keeps the dropdown snappy without refetching on every mount.
 *
 * Callers should treat `data?.items ?? []` as the option list (pending/error
 * → empty list, never crashes the form).
 */
export function useSubjectsQuery(params?: SubjectListParams) {
  return useQuery({
    queryKey: ["subjects", params ?? {}],
    queryFn: () => listSubjects(params),
    staleTime: 60_000,
  });
}

/** Grade-level dropdown query for a school (feeds subject creation). */
export function useGradeLevelsQuery(schoolId?: number) {
  return useQuery({
    queryKey: ["grade-levels", schoolId ?? null],
    queryFn: () => getGradeLevels(schoolId),
    staleTime: 60_000,
  });
}

/** Create a subject; invalidates the subjects list on success. */
export function useCreateSubjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateSubjectRequest) => createSubject(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

/** Update a subject's name/description; invalidates the list on success. */
export function useUpdateSubjectMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateSubjectRequest) => updateSubject(id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}

/** Change a subject's status; invalidates the list on success. */
export function useUpdateSubjectStatusMutation(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: AcademicStatus) => updateSubjectStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
    },
  });
}
