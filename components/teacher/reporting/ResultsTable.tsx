"use client";

import { useMemo, useState } from "react";
import { useSessionResultsQuery } from "@/hooks/queries/use-teacher-reporting";
import type { ResultDirection, ResultSort, SessionResultItem } from "@/lib/api/teacher-reporting";
import type { NormalizedApiError } from "@/lib/api";

const pageBtnClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded-small text-[#3D4852] outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "h-10 rounded-2xl bg-[#E0E5EC] px-3 pr-8 text-xs text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";
const numInputClass =
  "h-10 w-20 rounded-2xl bg-[#E0E5EC] px-3 text-xs text-[#3D4852] outline-none shadow-inset-pressed focus-visible:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300";
const sortHeaderClass =
  "px-3 pb-3 font-semibold cursor-pointer select-none transition-all duration-300 hover:text-[#6C63FF] focus-visible:text-[#6C63FF] outline-none";

const SORT_OPTIONS: { value: ResultSort; label: string }[] = [
  { value: "percentage", label: "Percentage" },
  { value: "score", label: "Score" },
  { value: "submittedAt", label: "Submitted" },
  { value: "studentName", label: "Name" },
  { value: "studentCode", label: "Code" },
];
const SIZE_OPTIONS = [10, 20, 50, 100];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function pctTone(p: number | null): string {
  if (p == null) return "text-[#A0AEC0]";
  if (p >= 80) return "text-[#38B2AC]";
  if (p >= 50) return "text-[#6C63FF]";
  return "text-[#6B7280]";
}

export function ResultsTable({ sessionId }: { sessionId: number }) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [sort, setSort] = useState<ResultSort>("percentage");
  const [direction, setDirection] = useState<ResultDirection>("DESC");
  const [minPct, setMinPct] = useState("");
  const [maxPct, setMaxPct] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { page, size, sort, direction };
    const min = minPct.trim() ? Number(minPct) : undefined;
    const max = maxPct.trim() ? Number(maxPct) : undefined;
    if (min != null && !Number.isNaN(min)) p.minPercentage = min;
    if (max != null && !Number.isNaN(max)) p.maxPercentage = max;
    return p;
  }, [page, size, sort, direction, minPct, maxPct]);

  // Client-side validation before sending (avoid 400 INVALID_RESULT_QUERY).
  const validatedParams = useMemo(() => {
    const min = minPct.trim() ? Number(minPct) : null;
    const max = maxPct.trim() ? Number(maxPct) : null;
    if (min != null && (min < 0 || min > 100)) return null;
    if (max != null && (max < 0 || max > 100)) return null;
    if (min != null && max != null && min > max) return null;
    return params;
  }, [params, minPct, maxPct]);

  const { data, isPending, isError, error, isFetching } = useSessionResultsQuery(
    sessionId,
    (validatedParams ?? {}) as Parameters<typeof useSessionResultsQuery>[1]
  );
  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const totalElements = data?.totalElements ?? 0;

  const applyFilters = () => {
    const min = minPct.trim() ? Number(minPct) : null;
    const max = maxPct.trim() ? Number(maxPct) : null;
    if (min != null && (min < 0 || min > 100)) { setFilterError("Min must be 0–100."); return; }
    if (max != null && (max < 0 || max > 100)) { setFilterError("Max must be 0–100."); return; }
    if (min != null && max != null && min > max) { setFilterError("Min must be ≤ Max."); return; }
    setFilterError(null);
    setPage(0);
  };

  const toggleSort = (col: ResultSort) => {
    if (sort === col) {
      setDirection(direction === "ASC" ? "DESC" : "ASC");
    } else {
      setSort(col);
      setDirection("DESC");
    }
  };

  return (
    <div className="rounded-container bg-[#E0E5EC] p-4 shadow-extruded sm:p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="r-sort" className="sr-only">Sort by</label>
          <select id="r-sort" value={sort} onChange={(e) => { setSort(e.target.value as ResultSort); setPage(0); }} className={selectClass}>
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="r-dir" className="sr-only">Direction</label>
          <select id="r-dir" value={direction} onChange={(e) => setDirection(e.target.value as ResultDirection)} className={selectClass}>
            <option value="DESC">↓ Desc</option>
            <option value="ASC">↑ Asc</option>
          </select>
        </div>
        <div>
          <label htmlFor="r-size" className="sr-only">Page size</label>
          <select id="r-size" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className={selectClass}>
            {SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} / page</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <input id="r-min" type="number" min={0} max={100} placeholder="Min %" value={minPct} onChange={(e) => setMinPct(e.target.value)} className={numInputClass} aria-label="Minimum percentage" />
          <span className="text-xs text-[#6B7280]">–</span>
          <input id="r-max" type="number" min={0} max={100} placeholder="Max %" value={maxPct} onChange={(e) => setMaxPct(e.target.value)} className={numInputClass} aria-label="Maximum percentage" />
          <button type="button" onClick={applyFilters} className="h-10 rounded-2xl bg-[#E0E5EC] px-3 text-xs font-semibold text-[#6C63FF] shadow-extruded-small outline-none transition-all duration-300 hover:-translate-y-0.5 hover:shadow-extruded-hover focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">Apply</button>
        </div>
      </div>
      {filterError && <p role="alert" className="mb-3 text-xs font-medium text-[#3D4852]">{filterError}</p>}

      {isPending ? (
        <div role="status" aria-busy="true" aria-label="Loading results" className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-2xl bg-[#E0E5EC] shadow-inset-small" />)}
        </div>
      ) : isError ? (
        <ErrorState error={error as unknown as NormalizedApiError | undefined} />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#6B7280]">No results yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-3 flex items-center gap-2 px-1 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
              <span>Students ({totalElements})</span>
              {isFetching && <span role="status" aria-label="Updating" className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#6C63FF]" />}
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#6B7280]">
                <th scope="col" className={`${sortHeaderClass} px-3 pb-3`} onClick={() => toggleSort("studentCode")}>Code {sort === "studentCode" ? (direction === "ASC" ? "↑" : "↓") : ""}</th>
                <th scope="col" className={`${sortHeaderClass} px-3 pb-3`} onClick={() => toggleSort("studentName")}>Name {sort === "studentName" ? (direction === "ASC" ? "↑" : "↓") : ""}</th>
                <th scope="col" className={`${sortHeaderClass} px-3 pb-3`} onClick={() => toggleSort("percentage")}>% {sort === "percentage" ? (direction === "ASC" ? "↑" : "↓") : ""}</th>
                <th scope="col" className={`${sortHeaderClass} px-3 pb-3`} onClick={() => toggleSort("score")}>Score {sort === "score" ? (direction === "ASC" ? "↑" : "↓") : ""}</th>
                <th scope="col" className="px-3 pb-3 font-semibold">#</th>
                <th scope="col" className={`${sortHeaderClass} px-3 pb-3`} onClick={() => toggleSort("submittedAt")}>Submitted {sort === "submittedAt" ? (direction === "ASC" ? "↑" : "↓") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => <ResultRow key={r.studentId} item={r} />)}
            </tbody>
          </table>
        </div>
      )}

      {!isPending && !isError && items.length > 0 && (
        <div className="mt-4 flex items-center justify-between px-1 pt-4">
          <p className="text-xs font-medium text-[#6B7280]" aria-live="polite">{totalElements} students · Page {page + 1} of {Math.max(totalPages, 1)}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 0} aria-label="Previous page" className={pageBtnClass}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages - 1} aria-label="Next page" className={pageBtnClass}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg></button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ item }: { item: SessionResultItem }) {
  return (
    <tr className="align-top text-[#3D4852]">
      <td className="px-3 py-2.5"><span className="rounded-inner bg-[#E0E5EC] px-2 py-0.5 font-mono text-xs shadow-inset-small">{item.studentCode ?? "—"}</span></td>
      <td className="px-3 py-2.5 font-medium">{item.displayName ?? "—"}</td>
      <td className="px-3 py-2.5"><span className={`font-bold tabular-nums ${pctTone(item.percentage)}`}>{item.percentage != null ? `${item.percentage}%` : "—"}</span></td>
      <td className="px-3 py-2.5 tabular-nums text-[#6B7280]">{item.score != null ? `${item.score}/${item.maxScore ?? "—"}` : "—"}</td>
      <td className="px-3 py-2.5 text-center tabular-nums text-[#6B7280]">{item.attemptCount}</td>
      <td className="px-3 py-2.5 text-[#6B7280]">{fmtDate(item.submittedAt)}</td>
    </tr>
  );
}

function ErrorState({ error }: { error: NormalizedApiError | undefined }) {
  const msg = error?.kind === "api" ? (error.message || "Couldn't load results.") : "Network error.";
  return <div role="alert" className="rounded-2xl bg-[#E0E5EC] p-4 text-sm font-medium text-[#3D4852] shadow-inset-deep">{msg}</div>;
}
