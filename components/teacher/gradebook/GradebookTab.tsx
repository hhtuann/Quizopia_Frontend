"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGradebookQuery, useGradebookSessionsQuery } from "@/hooks/queries/use-classrooms";
import { exportGradebook, type GradebookSortField } from "@/lib/api/classrooms";
import { GradebookTable } from "./GradebookTable";
import { Button, Input, cardVariants } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import type { NormalizedApiError } from "@/lib/api";

/**
 * CLASS-M3 (#54): the Gradebook tab of the teacher class page. A column
 * picker (session chips, default = server's first 5, min 1 / max 10) drives
 * the student × session matrix: debounced search, sort field + direction,
 * paged at 20 students with a render-phase clamp, sticky student column and
 * an XLSX export of exactly the selected columns.
 */

const MATRIX_PAGE_SIZE = 20;
const COLUMN_CATALOG_SIZE = 50;
const DEFAULT_COLUMN_COUNT = 5;
const MAX_COLUMNS = 10;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS: readonly { label: string; value: GradebookSortField }[] = [
  { label: "Name", value: "displayName" },
  { label: "Mean %", value: "meanPercentage" },
  { label: "Completion", value: "completion" },
];

function isAccessDenied(err: unknown): boolean {
  const norm = err as NormalizedApiError | undefined;
  return norm?.kind === "api" && norm.code === "CLASSROOM_ACCESS_DENIED";
}

function Skeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading gradebook…</span>
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-9 w-full rounded-lg bg-[#F1F5F9]" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 w-full rounded-lg bg-[#F1F5F9]/70" />
        ))}
      </div>
    </div>
  );
}

export function GradebookTab({ classId }: { classId: number }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sort, setSort] = useState<GradebookSortField>("displayName");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  // null = untouched → server default (first 5 columns in its ordering).
  const [selection, setSelection] = useState<number[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const columns = useGradebookSessionsQuery(classId, { page: 0, size: COLUMN_CATALOG_SIZE });
  const columnItems = useMemo(() => columns.data?.items ?? [], [columns.data]);
  const defaultIds = useMemo(
    () => columnItems.slice(0, DEFAULT_COLUMN_COUNT).map((s) => s.id),
    [columnItems]
  );
  const activeIds = selection ?? defaultIds;

  const matrix = useGradebookQuery(classId, {
    sessionIds: selection ?? undefined,
    page,
    size: MATRIX_PAGE_SIZE,
    search: search || undefined,
    sort,
    direction,
  });

  // Debounce the search box (≥300 ms); every committed term resets paging.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== search) {
        setSearch(next);
        setPage(0);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const totalPages = matrix.data?.totalPages ?? 1;
  // Render-phase clamp (same as M1/M2 lists): never strand on an over-paged
  // empty view when the result set shrinks (server clamps too — belt+braces).
  const lastPage = Math.max(0, totalPages - 1);
  if (page > lastPage) {
    setPage(lastPage);
  }

  const toggleColumn = (id: number) => {
    const next = activeIds.includes(id)
      ? activeIds.length > 1 // keep at least one column
        ? activeIds.filter((x) => x !== id)
        : activeIds
      : activeIds.length < MAX_COLUMNS // at most ten columns
        ? [...activeIds, id]
        : activeIds;
    // Landing back on the server default selection drops the explicit list.
    setSelection(next.length === defaultIds.length && next.every((x, i) => x === defaultIds[i]) ? null : next);
    setPage(0);
  };

  const onExport = async () => {
    if (activeIds.length === 0 || exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      // Mirror the matrix's active student filter so the export matches the
      // rows the teacher is looking at.
      const { blob, filename } = await exportGradebook(classId, activeIds, search || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export the gradebook. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const denied =
    (columns.isError && isAccessDenied(columns.error)) ||
    (matrix.isError && isAccessDenied(matrix.error));

  let body: React.ReactNode;
  if (denied) {
    body = (
      <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
        <p className="font-medium text-[#0F172A]">You don&rsquo;t have permission to view this gradebook.</p>
        <p className="mt-1">Only the class owner can see student results.</p>
      </div>
    );
  } else if (columns.isPending) {
    body = <Skeleton />;
  } else if (columns.isError) {
    body = (
      <div className={cn(cardVariants(), "flex flex-wrap items-center justify-between gap-3 p-6 text-sm text-[#64748B]")}>
        <p role="alert">Could not load the gradebook columns. Please try again.</p>
        <Button size="sm" variant="outline" onClick={() => columns.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (columnItems.length === 0) {
    body = (
      <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
        No sessions assigned to this class yet.{" "}
        <Link href="?tab=sessions" className="font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
          Assign sessions in the Sessions tab
        </Link>{" "}
        to build a gradebook.
      </div>
    );
  } else if (matrix.isPending && !matrix.data) {
    body = <Skeleton />;
  } else if (matrix.isError) {
    body = (
      <div className={cn(cardVariants(), "flex flex-wrap items-center justify-between gap-3 p-6 text-sm text-[#64748B]")}>
        <p role="alert">Could not load the gradebook. Please try again.</p>
        <Button size="sm" variant="outline" onClick={() => matrix.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if ((matrix.data?.students.length ?? 0) === 0) {
    body = (
      <div className={cn(cardVariants(), "p-6 text-sm text-[#64748B]")}>
        {search ? (
          <>No students match your search.</>
        ) : (
          <>
            No students in this class yet.{" "}
            <Link href="?tab=students" className="font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2">
              Add students in the Students tab
            </Link>
            .
          </>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <GradebookTable sessions={matrix.data!.sessions} students={matrix.data!.students} />
        {totalPages > 1 && (
          <nav className="mt-4 flex items-center justify-between" aria-label="Gradebook pages">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <p className="text-xs text-[#64748B]">
              Page {page + 1} of {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </nav>
        )}
      </>
    );
  }

  return (
    <section aria-label="Gradebook">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[#0F172A]">Gradebook</h2>
          <p className="mt-0.5 text-sm text-[#64748B]">
            {activeIds.length} of {columns.data?.totalElements ?? "…"} session columns ·{" "}
            <span className="tabular-nums">{matrix.data?.totalElements ?? "…"}</span> students
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onExport}
          disabled={exporting || matrix.isError || activeIds.length === 0}
        >
          {exporting ? "Exporting…" : "Export XLSX"}
        </Button>
      </div>

      {exportError && (
        <p className="mb-4 text-sm text-[#EF4444]" role="alert">
          {exportError}
        </p>
      )}

      {matrix.data?.historyCoverage === "SINCE_MIGRATION" && (
        <p className="mb-4 text-xs text-[#94A3B8]">
          Membership history is complete from the analytics migration onward; earlier departures
          are not recorded.
        </p>
      )}

      {columnItems.length > 0 && (
        <div className="mb-4" role="group" aria-label="Gradebook session columns">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">
              Columns ({activeIds.length}/{MAX_COLUMNS})
            </p>
            {selection && (
              <button
                type="button"
                onClick={() => {
                  setSelection(null);
                  setPage(0);
                }}
                className="rounded-md text-xs font-semibold text-[#64748B] outline-none transition-colors hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2"
              >
                Reset to default
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {columnItems.map((s) => {
              const selected = activeIds.includes(s.id);
              const maxed = !selected && activeIds.length >= MAX_COLUMNS;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={maxed}
                  onClick={() => toggleColumn(s.id)}
                  title={maxed ? `At most ${MAX_COLUMNS} columns` : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2",
                    selected
                      ? "bg-gradient-to-r from-[#0052FF] to-[#4D7CFF] text-white"
                      : "bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {s.title}
                  <span className="ml-1.5 font-mono opacity-70">{s.code}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search students…"
          aria-label="Search students"
          className="h-9 w-52"
        />
        <label className="sr-only" htmlFor={`gradebook-sort-${classId}`}>
          Sort students by
        </label>
        <select
          id={`gradebook-sort-${classId}`}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as GradebookSortField);
            setPage(0);
          }}
          className="h-9 rounded-lg border border-[#E2E8F0] bg-transparent px-3 text-sm font-medium text-[#0F172A] outline-none transition-all focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF] focus:ring-offset-2"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          aria-label={`Sort direction: ${direction === "asc" ? "ascending" : "descending"}`}
          onClick={() => {
            setDirection((d) => (d === "asc" ? "desc" : "asc"));
            setPage(0);
          }}
        >
          {direction === "asc" ? "↑ Asc" : "↓ Desc"}
        </Button>
      </div>

      {body}
    </section>
  );
}
