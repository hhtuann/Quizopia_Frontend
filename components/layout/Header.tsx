"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";
import { NotificationBell } from "./NotificationBell";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { QuizopiaLogo } from "./QuizopiaLogo";
import { useAuth } from "@/hooks/useAuth";
import { authApi } from "@/lib/auth";
import { useActiveView } from "@/lib/view/store";
import type { NormalizedApiError } from "@/lib/api";
import { ConfirmDialog } from "@/components/teacher/exam-editor/ConfirmDialog";
import { initialsOf } from "@/lib/utils/initials";

interface HeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  /** Identity-M2: menu-driven view switch (overlay owned by AppShell). */
  onViewSwitch?: (view: "student" | "teacher") => void;
}


export default function Header({ isMobileMenuOpen, setIsMobileMenuOpen, onViewSwitch }: HeaderProps) {
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const { view, canStudent, canTeacher } = useActiveView();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  // Review M1-06: Google account linking (authenticated + password re-auth).
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Review M1-06: offer linking only when the backend has Google configured
  // and this account has no Google identity yet.
  useEffect(() => {
    let cancelled = false;
    authApi
      .providers()
      .then((p) => {
        if (!cancelled) setGoogleEnabled(p.googleEnabled);
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the profile menu on outside-click or Escape (focus returns to the
  // trigger so keyboard users are not stranded).
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Focus the first enabled item when the menu opens.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)")?.focus();
  }, [menuOpen]);

  /** Roving keyboard navigation inside the menu (Arrow/Home/End). */
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button[role='menuitem']:not(:disabled)") ?? []),
    ];
    if (items.length === 0) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = items.length - 1;
    else if (currentIndex === -1) nextIndex = e.key === "ArrowUp" ? items.length - 1 : 0;
    else nextIndex = e.key === "ArrowDown" ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  };


  /** Re-authenticate with the account password, then bounce to Google. */
  const handleStartGoogleLink = async () => {
    setLinkBusy(true);
    setLinkError(null);
    try {
      const { authorizationUrl } = await authApi.startGoogleLink({ password: linkPassword });
      window.location.assign(authorizationUrl);
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "api" && norm.code === "AUTH_INVALID_CREDENTIALS") {
        setLinkError("Mật khẩu không đúng.");
      } else if (norm?.kind === "network") {
        setLinkError("Lỗi mạng — hãy thử lại.");
      } else {
        setLinkError("Không thể bắt đầu liên kết. Hãy thử lại.");
      }
      setLinkBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  };

  /** Identity-M2: explicit confirmation → backend self-upgrade → identity refresh. */
  const handleUpgradeToTeacher = async () => {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      await authApi.upgradeToTeacher();
      await refreshUser();
      setUpgradeOpen(false);
      // UX review: consent was already given in the dialog — go straight
      // into the branded transition overlay and land in the Teacher view
      // (no follow-up "switch now?" prompt).
      onViewSwitch?.("teacher");
    } catch (err) {
      const norm = err as NormalizedApiError;
      if (norm?.kind === "api" && norm.code === "AUTH_EMAIL_NOT_VERIFIED") {
        setUpgradeError("Verify your email first, then try again.");
      } else if (norm?.kind === "network") {
        setUpgradeError("Network error — check your connection and try again.");
      } else {
        setUpgradeError("Could not register as a teacher. Please try again.");
      }
    } finally {
      setUpgrading(false);
    }
  };

  const displayName = user?.displayName || user?.username || "Account";
  const initials = initialsOf(displayName);
  const isTeacher = user?.roles?.includes("TEACHER") ?? false;

  return (
    <header className="app-topbar relative w-full border-b border-[#E2E8F0] bg-white/95">
      <div className="app-topbar-inner">
        <div className="flex h-full items-center justify-between gap-2 sm:gap-4">

          {/* Logo brand — click returns to the Dashboard */}
          <Link
            href="/"
            aria-label="Go to dashboard"
            className="flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
          >
            <QuizopiaLogo withWordmark wordmarkClassName="hidden lg:inline" />
          </Link>

          {/* Search bar - Desktop */}
          <div className="mx-4 hidden min-w-0 max-w-md flex-1 lg:mx-8 lg:flex">
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#64748B]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z"
                  />
                </svg>
              </div>
              <Input
                type="text"
                placeholder="Search quizzes, categories..."
                aria-label="Search quizzes and categories"
                className="h-11 pl-11"
              />
            </div>
          </div>

          {/* Header Actions - Profile / Mobile Menu Toggle */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">

            {/* Workspace switcher (TEACHER, Desktop) — UI preference only */}
            {isTeacher && <WorkspaceSwitcher />}

            {/* Notification Bell (Desktop) */}
            <NotificationBell />

            {/* Profile menu — fixed-width user box + account dropdown */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                ref={triggerRef}
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Tài khoản"
                title={user?.email ? `${displayName} — ${user.email}` : displayName}
                className="flex h-11 items-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-2 text-sm font-medium text-[#0F172A] shadow-sm outline-none transition-all duration-200 hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA] sm:w-[176px] sm:px-3"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#0052FF] to-[#4D7CFF] text-xs font-bold text-white">
                  {initials}
                </div>
                <span className="hidden min-w-0 flex-1 truncate overflow-hidden text-ellipsis sm:inline">
                  {displayName}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className={`h-4 w-4 shrink-0 text-[#64748B] transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Tài khoản"
                  onKeyDown={onMenuKeyDown}
                  className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-var(--topbar-height)-1rem)] w-[280px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white p-2 shadow-lg"
                >
                  {/* Menu header — full name/email via title tooltips */}
                  <div className="min-w-0 px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-[#0F172A]" title={displayName}>
                      {displayName}
                    </p>
                    <p className="truncate text-xs text-[#64748B]" title={user?.email ?? undefined}>
                      {user?.email}
                    </p>
                  </div>

                  {/* Shared profile is independent of the active role view. */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setIsMobileMenuOpen(false);
                      router.push("/profile");
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#0F172A] outline-none transition-colors duration-200 hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5 shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                      />
                    </svg>
                    Hồ sơ
                  </button>

                  {/* Identity-M2: student-only accounts can self-register as teacher */}
                  {canStudent && !canTeacher && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setUpgradeOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#0052FF] outline-none transition-colors duration-200 hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.628 48.628 0 0 1 12 20.904a48.628 48.628 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
                        />
                      </svg>
                      Đăng ký làm Giáo viên
                    </button>
                  )}

                  {/* Identity-M2: dual-role accounts switch views */}
                  {canStudent && canTeacher && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onViewSwitch?.(view === "student" ? "teacher" : "student");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#0F172A] outline-none transition-colors duration-200 hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-5 w-5 shrink-0 text-[#0052FF]"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                        />
                      </svg>
                      {view === "student" ? "Chuyển sang Giáo viên" : "Chuyển sang Học sinh"}
                    </button>
                  )}

                  {/* Review M1-06: link Google to THIS account (explicit,
                      password-verified action — never silent). */}
                  {googleEnabled && !user?.googleLinked && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setLinkPassword("");
                        setLinkError(null);
                        setLinkOpen(true);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#0052FF] outline-none transition-colors duration-200 hover:bg-[#0052FF]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF]"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                        className="h-5 w-5 shrink-0"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                        />
                      </svg>
                      Liên kết đăng nhập Google
                    </button>
                  )}
                  {user?.googleLinked && (
                    <p className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[#64748B]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" aria-hidden="true" />
                      Google đã được liên kết
                    </p>
                  )}

                  <div className="my-1.5 h-px bg-[#E2E8F0]" />

                  {/* Đăng xuất — destructive */}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={handleLogout}
                    aria-label="Đăng xuất"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#EF4444] outline-none transition-colors duration-200 hover:bg-[#EF4444]/5 focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:opacity-60"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                      className="h-5 w-5 shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                      />
                    </svg>
                    {busy ? "Đang đăng xuất…" : "Đăng xuất"}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Hamburger menu toggle button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex lg:hidden h-11 w-11 items-center justify-center rounded-lg text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0F172A] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
              aria-label="Toggle navigation menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {isMobileMenuOpen ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                  className="w-6 h-6 text-[#0052FF]"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="w-6 h-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              )}
            </button>

          </div>

        </div>
      </div>

      {/* Identity-M2: teacher self-upgrade confirmation */}
      <ConfirmDialog
        open={upgradeOpen}
        titleId="teacher-upgrade-title"
        title="Đăng ký làm Giáo viên?"
        description={
          <>
            Tài khoản của bạn sẽ được thêm quyền Giáo viên ngay sau khi xác nhận
            (vai trò Học sinh được giữ nguyên). Bạn có thể tạo ngân hàng câu
            hỏi, đề thi và lớp học trong không gian cá nhân của mình.
          </>
        }
        confirmLabel="Xác nhận đăng ký"
        cancelLabel="Hủy"
        busyLabel="Đang đăng ký…"
        busy={upgrading}
        onConfirm={() => void handleUpgradeToTeacher()}
        onCancel={() => {
          setUpgradeOpen(false);
          setUpgradeError(null);
        }}
      />
      {upgradeOpen && upgradeError && (
        <p
          role="alert"
          className="sr-only"
        >
          {upgradeError}
        </p>
      )}
      {/* Review M1-06: password re-authentication before linking */}
      {linkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="google-link-title"
        >
          <div className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-sm" onClick={() => setLinkOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-xl">
            <h2 id="google-link-title" className="text-lg font-bold text-[#0F172A]">
              Liên kết đăng nhập Google
            </h2>
            <p className="mt-2 text-sm font-medium text-[#64748B]">
              Xác nhận mật khẩu Quizopia của bạn để bắt đầu. Sau khi Google xác
              nhận, hai cách đăng nhập sẽ cùng trỏ về tài khoản này.
            </p>
            <input
              type="password"
              id="google-link-password"
              autoComplete="current-password"
              placeholder="Mật khẩu hiện tại"
              aria-label="Mật khẩu hiện tại"
              value={linkPassword}
              disabled={linkBusy}
              onChange={(e) => setLinkPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && linkPassword.length >= 8) void handleStartGoogleLink();
                if (e.key === "Escape") setLinkOpen(false);
              }}
              className="mt-4 h-12 w-full rounded-lg border border-[#E2E8F0] bg-white px-4 text-base text-[#0F172A] outline-none transition-colors focus:border-[#0052FF] focus:ring-2 focus:ring-[#0052FF]/30"
            />
            {linkError && (
              <p role="alert" className="mt-2 text-sm font-semibold text-[#EF4444]">
                {linkError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLinkOpen(false)}
                disabled={linkBusy}
                className="rounded-lg border border-[#E2E8F0] px-4 py-2.5 text-sm font-semibold text-[#0F172A] outline-none transition-colors hover:bg-[#F1F5F9] focus-visible:ring-2 focus-visible:ring-[#0052FF] disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleStartGoogleLink()}
                disabled={linkBusy || linkPassword.length < 8}
                className="rounded-lg bg-[#0052FF] px-4 py-2.5 text-sm font-bold text-white outline-none transition-colors hover:bg-[#0044D6] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {linkBusy ? "Đang chuyển…" : "Tiếp tục với Google"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
