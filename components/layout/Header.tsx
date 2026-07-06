"use client";

import React from "react";

interface HeaderProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export default function Header({ isMobileMenuOpen, setIsMobileMenuOpen }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#E0E5EC]/85 backdrop-blur-md transition-all duration-300">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between gap-4">
          
          {/* Logo Brand Area */}
          <div className="flex items-center gap-3">
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
          </div>

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

            {/* Profile Avatar Button */}
            <button className="flex h-11 items-center gap-2 rounded-2xl bg-[#E0E5EC] px-4 shadow-extruded text-sm font-medium text-[#3D4852] hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-0.5 active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300 neumorphic-active-press">
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#38B2AC] flex items-center justify-center text-white font-bold text-xs">
                JD
              </div>
              <span className="hidden sm:inline">John Doe</span>
            </button>

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
