"use client";

import { useQuery } from "@tanstack/react-query";
import { getSchools } from "@/lib/api/schools";

/** School list query. Schools rarely change, so a generous staleTime. */
export function useSchoolsQuery() {
  return useQuery({ queryKey: ["schools"], queryFn: getSchools, staleTime: 300_000 });
}
