"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAddMembersMutation } from "@/hooks/queries/use-classrooms";
import { searchStudents, type StudentSearchResult } from "@/lib/api/student-onboarding";
import type { AddMembersResponse } from "@/lib/api/classrooms";
import { Button, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

/**
 * Reusable student search + multi-select (FE-ONBOARD-2). Replaces the old
 * textarea-ID-entry pattern with a debounced search (by student_code / name /
 * username), a results dropdown, selected-student chips, and an "Add" button
 * that POSTs to the classroom members endpoint.
 */
export function StudentSearchSelect({
  classId,
  excludeIds,
  onResult,
}: {
  classId: number;
  excludeIds: number[];
  onResult: (r: AddMembersResponse) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<StudentSearchResult[]>([]);
  const [result, setResult] = useState<AddMembersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addMut = useAddMembersMutation(classId);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(h);
  }, [query]);

  const { data: searchData } = useQuery({
    queryKey: ["student-search", debounced],
    queryFn: () => searchStudents(debounced),
    enabled: debounced.length >= 2,
  });

  const excludedSet = new Set(excludeIds);
  const results = (searchData?.items ?? []).filter(
    (r) =>
      !excludedSet.has(r.studentProfileId) &&
      !selected.some((s) => s.studentProfileId === r.studentProfileId)
  );

  const addStudent = (s: StudentSearchResult) => {
    setSelected((prev) => [...prev, s]);
    setQuery("");
    setResult(null);
    setError(null);
  };

  const removeStudent = (id: number) =>
    setSelected((prev) => prev.filter((s) => s.studentProfileId !== id));

  const onAdd = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await addMut.mutateAsync({
        studentProfileIds: selected.map((s) => s.studentProfileId),
      });
      setResult(res);
      setSelected([]);
      onResult(res);
    } catch {
      setError("Could not add students. Please try again.");
    }
  };

  return (
    <div className={cn(cardVariants(), "p-5")}>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Add students</h2>

      {/* Search input */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by student code, name, or username…"
        className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
        aria-label="Search students"
      />

      {/* Results dropdown */}
      {debounced.length >= 2 && results.length > 0 && (
        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-md">
          {results.map((s) => (
            <button
              key={s.studentProfileId}
              type="button"
              onClick={() => addStudent(s)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
            >
              <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs text-[#64748B]">
                {s.studentCode}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[#0F172A]">{s.displayName}</span>
                <span className="block truncate text-xs text-[#64748B]">{s.username} · {s.email}</span>
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4 shrink-0 text-[#0052FF]" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          ))}
        </div>
      )}
      {debounced.length >= 2 && results.length === 0 && !searchData && (
        <p className="mt-2 pl-1 text-xs text-[#64748B]">Searching…</p>
      )}
      {debounced.length >= 2 && results.length === 0 && searchData && (
        <p className="mt-2 pl-1 text-xs text-[#64748B]">No students found (or already added).</p>
      )}

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.studentProfileId}
              className="inline-flex items-center gap-2 rounded-lg border border-[#0052FF]/30 bg-[#0052FF]/5 px-3 py-1.5 text-sm"
            >
              <span className="font-mono text-xs text-[#0052FF]">{s.studentCode}</span>
              <span className="font-medium text-[#0F172A]">{s.displayName}</span>
              <button
                type="button"
                onClick={() => removeStudent(s.studentProfileId)}
                aria-label={`Remove ${s.displayName}`}
                className="ml-1 text-[#64748B] hover:text-[#EF4444]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add button */}
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" disabled={selected.length === 0 || addMut.isPending} onClick={onAdd}>
          {addMut.isPending ? "Adding…" : `Add ${selected.length > 0 ? `${selected.length} ` : ""}student${selected.length === 1 ? "" : "s"}`}
        </Button>
      </div>

      {/* Result */}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/5 p-3 text-xs font-medium text-[#EF4444]">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="mt-3 space-y-1.5 rounded-lg border border-[#E2E8F0] bg-[#F1F5F9] p-3 text-xs">
          <p className="font-semibold text-[#10B981]">Added {result.added} student{result.added === 1 ? "" : "s"}.</p>
          {result.duplicated.length > 0 && (
            <p className="text-[#64748B]">Already members: {result.duplicated.join(", ")}</p>
          )}
          {result.invalid.length > 0 && (
            <p className="text-[#64748B]">Not found / not in your school: {result.invalid.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}
