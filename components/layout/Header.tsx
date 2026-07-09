"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

interface HeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

/** Up to two uppercase initials from a display name (first + last word). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Header({ isMobileMenuOpen, setIsMobileMenuOpen }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the profile menu on outside-click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  };

  const displayName = user?.displayName || user?.username || "Account";
  const initials = initialsOf(displayName);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#E0E5EC]/85 backdrop-blur-md transition-all duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between gap-4">
          
          {/* Logo brand — click returns to the Dashboard */}
          <Link href="/" aria-label="Go to dashboard" className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded text-[#6C63FF] animate-float">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904 9 21l8.982-11.861H13.62l.812-5.043L5.45 15.904h4.363Z"
                />
              </svg>
            </div>
            <span className="font-display font-extrabold text-2xl tracking-tight text-[#3D4852]">
              Quiz<span className="text-[#6C63FF]">opia</span>
            </span>
          </Link>

          {/* Search bar - Desktop */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#6B7280]">
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
              <input
                type="text"
                placeholder="Search quizzes, categories..."
                aria-label="Search quizzes and categories"
                className="w-full h-11 rounded-2xl bg-[#E0E5EC] pl-11 pr-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300"
              />
            </div>
          </div>

          {/* Header Actions - Profile / Mobile Menu Toggle */}
          <div className="flex items-center gap-4">
            
            {/* Notification Button (Desktop) */}
            <button className="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded text-[#3D4852] hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-0.5 active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300 neumorphic-active-press" aria-label="Notifications">
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
                  d="M14.857 17.082a9.013 9.013 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.581a5.006 5.006 0 0 0 1.25 5.176 12.052 12.052 0 0 0 5.291 3.059m1.39 0a12.052 12.052 0 0 0 5.291-3.059 5.006 5.006 0 0 0 1.25-5.176M12 3v1.5m0 9v.008H12v-.008Z"
                />
              </svg>
            </button>

            {/* Profile menu — real user + sign out */}
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex h-11 items-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 shadow-extruded text-sm font-medium text-[#3D4852] hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-0.5 active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300 neumorphic-active-press"
              >
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#38B2AC] flex items-center justify-center text-white font-bold text-xs">
                  {initials}
                </div>
                <span className="hidden sm:inline">{displayName}</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-64 rounded-container bg-[#E0E5EC] p-3 shadow-extruded"
                >
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-[#3D4852]">{displayName}</p>
                    <p className="truncate text-xs text-[#6B7280]">{user?.email}</p>
                    {user?.roles && user.roles.length > 0 && (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#6C63FF]">
                        {user.roles.join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    onClick={handleLogout}
                    aria-label="Sign out"
                    className="mt-1 w-full rounded-button bg-[#E0E5EC] px-4 py-3 text-left text-sm font-semibold text-[#3D4852] shadow-inset-pressed transition-all duration-300 hover:shadow-inset-deep active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] outline-none disabled:opacity-60"
                  >
                    {busy ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Hamburger menu toggle button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex md:hidden h-11 w-11 items-center justify-center rounded-2xl bg-[#E0E5EC] shadow-extruded text-[#3D4852] hover:shadow-extruded-hover active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300"
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
                  className="w-6 h-6 text-[#6C63FF]"
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
    </header>
  );
}
