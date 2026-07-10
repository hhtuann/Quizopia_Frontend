"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useNotificationsQuery, useUnreadCountQuery, useMarkReadMutation, useMarkAllReadMutation } from "@/hooks/queries/use-notifications";

const TYPE_ICON: Record<string, string> = {
  RESULT_GRADED: "✓",
  IMPORT_COMPLETED: "↑",
  SESSION_ENDED: "■",
  STUDENT_JOINED_CLASS: "+",
  EXAM_SESSION_AVAILABLE: "📝",
  ADDED_TO_CLASS: "+",
  STUDENT_STARTED_EXAM: "▶",
  NEW_USER_REGISTERED: "★",
  NEW_ACADEMIC_ACTIVITY: "🏫",
  USER_STATUS_CHANGED: "⊘",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: notifData } = useNotificationsQuery();
  const { data: unreadData } = useUnreadCountQuery();
  const markReadMut = useMarkReadMutation();
  const markAllMut = useMarkAllReadMutation();
  const unread = unreadData?.count ?? 0;
  const items = notifData?.items ?? [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const handleClick = async (id: number, link: string | null) => {
    await markReadMut.mutateAsync(id);
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative hidden h-11 w-11 items-center justify-center rounded-lg text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] sm:flex"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#0052FF] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 origin-top-right rounded-xl border border-[#E2E8F0] bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
            <span className="font-display text-sm font-bold text-[#0F172A]">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="text-xs font-semibold text-[#0052FF] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0052FF]"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#64748B]">No notifications</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n.id, n.link)}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-[#F1F5F9] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#F8FAFC]",
                    n.readAt === null && "bg-[#0052FF]/[0.03]"
                  )}
                >
                  {/* Icon */}
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                    n.readAt === null ? "bg-[#0052FF]/10 text-[#0052FF]" : "bg-[#F1F5F9] text-[#94A3B8]"
                  )}>
                    {TYPE_ICON[n.type] ?? "•"}
                  </span>
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", n.readAt === null ? "font-semibold text-[#0F172A]" : "font-medium text-[#64748B]")}>
                      {n.title}
                    </p>
                    {n.message && (
                      <p className="mt-0.5 truncate text-xs text-[#64748B]">{n.message}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">{timeAgo(n.createdAt)}</p>
                  </div>
                  {/* Unread dot */}
                  {n.readAt === null && (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0052FF]" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
