"use client";

import { useEffect, useRef, useState } from "react";
import { useActiveWorkspace } from "@/hooks/queries/use-workspaces";
import { useWorkspacePreference } from "@/lib/workspace/store";
import { cn } from "@/lib/utils/cn";

/**
 * Workspace switcher (Phase 1, Task A5) — a small dropdown next to the user
 * info in the Header. Lists the caller's workspaces (Personal + organizations)
 * with a role badge; the selection is a UI preference only (persisted under
 * "quizopia.activeWorkspaceId") and is passed as `workspaceId` when creating
 * banks/exams. Default = the personal workspace.
 *
 * Minimalist Modern: JetBrains Mono label, electric-blue gradient active state.
 */
export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, isLoading } = useActiveWorkspace();
  const setActiveWorkspace = useWorkspacePreference((s) => s.setActiveWorkspace);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Single workspace (personal only) → keep the pill visible but disabled.
  if (isLoading || !activeWorkspace) {
    return (
      <div
        aria-hidden={isLoading}
        className={cn(
          "hidden h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 md:flex",
          isLoading && "animate-pulse"
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-4 w-4 text-[#64748B]"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
          />
        </svg>
        <span className="text-sm font-medium text-[#64748B]">Workspace</span>
      </div>
    );
  }

  return (
    <div className="relative hidden md:block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex h-11 max-w-[220px] items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm font-medium text-[#0F172A] shadow-sm outline-none transition-all duration-200 hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.2}
            stroke="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
            />
          </svg>
        </span>
        <span className="truncate">{activeWorkspace.name}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          className="h-3.5 w-3.5 shrink-0 text-[#64748B]"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Workspaces"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-lg"
        >
          <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[#64748B]">
            Workspace
          </p>
          {workspaces.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[#64748B]">No workspaces available.</p>
          ) : (
            <ul>
              {workspaces.map((w) => {
                const selected = w.workspaceId === activeWorkspace.workspaceId;
                return (
                  <li key={w.workspaceId}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        setActiveWorkspace(w.workspaceId);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0052FF]",
                        selected ? "bg-[#0052FF]/5" : "hover:bg-[#F1F5F9]"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase",
                          selected
                            ? "bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]"
                            : "border border-[#E2E8F0] bg-[#F1F5F9] text-[#64748B]"
                        )}
                        aria-hidden="true"
                      >
                        {w.workspaceType === "PERSONAL" ? "P" : "O"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#0F172A]">
                          {w.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-[#64748B]">
                            {w.workspaceType === "PERSONAL" ? "Personal" : "Organization"}
                          </span>
                          <span className="text-[10px] text-[#94A3B8]">·</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0052FF]">
                            {w.role}
                          </span>
                        </span>
                      </span>
                      {selected && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                          stroke="currentColor"
                          className="h-4 w-4 shrink-0 text-[#0052FF]"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
