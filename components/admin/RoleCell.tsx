"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { useAssignRoleMutation, useRemoveRoleMutation } from "@/hooks/queries/use-users";

/**
 * Discord-style role picker for a single user row.
 *
 * Shows the user's current roles as badges. A "+" button appears on hover (or
 * focus); clicking it opens a checklist popover of every role — checked means
 * the user currently holds it, unchecked means they don't. Ticking/unticking
 * a row assigns or revokes the role.
 *
 * The popover is `position: fixed` and positioned from the button's bounding
 * rect so it is never clipped by the table's `overflow-x-auto` scroll box or
 * the AppShell's `overflow-x-hidden` main column.
 */
export function RoleCell({
  userId,
  roles,
  allRoles,
}: {
  userId: number;
  roles: string[];
  allRoles: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const assignMut = useAssignRoleMutation();
  const removeMut = useRemoveRoleMutation();

  const placePopover = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 224; // w-56
    const margin = 8;
    const left = Math.min(r.left, window.innerWidth - width - margin);
    setPos({ top: r.bottom + 6, left: Math.max(margin, left) });
  };

  useLayoutEffect(() => {
    if (open) placePopover();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = async (code: string) => {
    if (pending) return;
    setPending(code);
    try {
      if (roles.includes(code)) {
        await removeMut.mutateAsync({ id: userId, roleCode: code });
      } else {
        await assignMut.mutateAsync({ id: userId, roleCode: code });
      }
    } catch {
      /* surfaced via the invalidated users list; keep the popover usable */
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="group/role inline-flex max-w-full items-center gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {roles.length === 0 ? (
          <span className="text-xs text-[#64748B]">None</span>
        ) : (
          roles.map((r) => (
            <Badge key={r} variant="default">{r}</Badge>
          ))
        )}
      </div>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Manage roles"
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border outline-none transition-all duration-200",
          "opacity-0 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#0052FF] group-hover/role:opacity-100",
          open
            ? "border-[#0052FF] bg-[#0052FF]/5 text-[#0052FF] opacity-100"
            : "border-[#E2E8F0] text-[#64748B] hover:border-[#0052FF] hover:text-[#0052FF]"
        )}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      {open && pos && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Roles"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-56 rounded-xl border border-[#E2E8F0] bg-white p-1.5 shadow-[0_10px_15px_rgba(0,0,0,0.08)]"
        >
          <p className="px-2 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-[#64748B]">Roles</p>
          <ul className="space-y-0.5">
            {allRoles.map((code) => {
              const checked = roles.includes(code);
              const busy = pending === code;
              return (
                <li key={code}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={busy}
                    onClick={() => toggle(code)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-[#0F172A] outline-none transition-colors hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked ? "border-[#0052FF] bg-[#0052FF] text-white" : "border-[#CBD5E1] bg-white"
                      )}
                    >
                      {checked && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="h-3 w-3" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span className={cn(busy && "animate-pulse")}>{code}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
