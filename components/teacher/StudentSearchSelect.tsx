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
 * textarea-ID-entry pattern with a debounced search (by display name /
 * username), a results dropdown, selected-student chips, and an "Add" button
 * that POSTs user ids to the classroom members endpoint.
 */
export function StudentSearchSelect({
  classId,
  excludeIds,
  onResult,
  unboxed = false,
}: {
  classId: number;
  excludeIds: number[];
  onResult: (r: AddMembersResponse) => void;
  /** Render without the outer card (when embedded in AddStudentsPanel). */
  unboxed?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<StudentSearchResult[]>([]);
  const [, setResult] = useState<AddMembersResponse | null>(null);
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
      !excludedSet.has(r.userId) &&
      !selected.some((s) => s.userId === r.userId)
  );

  const addStudent = (s: StudentSearchResult) => {
    setSelected((prev) => [...prev, s]);
    setQuery("");
    setResult(null);
    setError(null);
  };

  const removeStudent = (id: number) =>
    setSelected((prev) => prev.filter((s) => s.userId !== id));

  const onAdd = async () => {
    setError(null);
    setResult(null);
    try {
      const res = await addMut.mutateAsync({
        userIds: selected.map((s) => s.userId),
      });
      setResult(res);
      setSelected([]);
      // Auto-dismiss the inline result after 4 seconds.
      setTimeout(() => setResult(null), 4000);
      onResult(res);
    } catch {
      setError("Could not add students. Please try again.");
    }
  };

  return (
    <div className={unboxed ? "" : cn(cardVariants(), "p-5")}>
      {!unboxed && (
        <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
          Add students
        </h2>
      )}

      {/* Search input + floating results overlay (does not expand the card).
          The overlay is anchored to the input wrapper so it never stretches
          over the Add button. */}
      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username…"
            className="h-11 w-full rounded-lg border border-[#E2E8F0] bg-transparent px-4 text-sm text-[#0F172A] placeholder:text-[#64748B]/50 outline-none transition-all duration-200 focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
            aria-label="Search students"
          />
          {query.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[#E2E8F0] bg-white p-1 shadow-lg">
            {results.length === 0 && (
              <p className="px-3 py-2 text-sm text-[#64748B]">
                {debounced.length >= 2 && searchData
                  ? "No students found (or already added)."
                  : "Searching…"}
              </p>
            )}
            {results.map((s) => (
            <button
              key={s.userId}
              type="button"
              onClick={() => addStudent(s)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
            >
              {s.studentCode && (
                <span className="rounded-md border border-[#E2E8F0] bg-[#F1F5F9] px-1.5 py-0.5 font-mono text-xs text-[#64748B]">
                  {s.studentCode}
                </span>
              )}
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
        </div>
        <Button
          type="button"
          className="shrink-0"
          disabled={selected.length === 0 || addMut.isPending}
          onClick={onAdd}
        >
          {addMut.isPending
            ? "Adding…"
            : `Add ${selected.length} student${selected.length === 1 ? "" : "s"}`}
        </Button>
      </div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((s) => (
            <span
              key={s.userId}
              className="inline-flex items-center gap-2 rounded-lg border border-[#0052FF]/30 bg-[#0052FF]/5 px-3 py-1.5 text-sm"
            >
              {s.studentCode && <span className="font-mono text-xs text-[#0052FF]">{s.studentCode}</span>}
              <span className="font-medium text-[#0F172A]">{s.displayName}</span>
              <button
                type="button"
                onClick={() => removeStudent(s.userId)}
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

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-[#EF4444]">{error}</p>
      )}
    </div>
  );
}
