"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getGradeLevels,
  listSubjects,
  type SubjectListParams,
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

/** Grade-level dropdown query (global catalog, feeds the subject select). */
export function useGradeLevelsQuery() {
  return useQuery({
    queryKey: ["grade-levels"],
    queryFn: () => getGradeLevels(),
    staleTime: 60_000,
  });
}
