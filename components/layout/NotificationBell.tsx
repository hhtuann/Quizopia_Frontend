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

function NotifIcon({ type, unread }: { type: string; unread: boolean }) {
  const color = unread ? "text-[#0052FF]" : "text-[#94A3B8]";
  const common = `h-4 w-4 ${color}`;
  switch (type) {
    case "RESULT_GRADED":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>;
    case "IMPORT_COMPLETED":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
    case "SESSION_ENDED":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
    case "STUDENT_JOINED_CLASS":
    case "ADDED_TO_CLASS":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>;
    case "STUDENT_STARTED_EXAM":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>;
    case "NEW_USER_REGISTERED":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>;
    case "NEW_ACADEMIC_ACTIVITY":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>;
    case "USER_STATUS_CHANGED":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>;
    case "EXAM_SESSION_AVAILABLE":
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.483 0-.967.078-1.41.226M8.25 8.25c0 6.5-4.687 9-6.375 9M8.25 8.25c2.25 0 5.25 1.5 5.25 6" /></svg>;
    default:
      return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>;
  }
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
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    n.readAt === null ? "bg-[#0052FF]/10" : "bg-[#F1F5F9]"
                  )}>
                    <NotifIcon type={n.type} unread={n.readAt === null} />
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
