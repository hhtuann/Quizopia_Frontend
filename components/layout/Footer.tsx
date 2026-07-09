import React from "react";

export default function Footer() {
  return (
    <footer className="mt-auto w-full select-none border-t border-[#E2E8F0] py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">

          {/* Logo / Brand Name */}
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-[#0F172A]">
              © {new Date().getFullYear()} Quizopia. All rights reserved.
            </p>
            <p className="mt-1 text-xs text-[#64748B]">
              Crafted with Minimalist Modern design.
            </p>
          </div>

          {/* Quick Footer Links */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["Terms", "Privacy", "Help Center", "Contact"].map((item) => (
              <a
                key={item}
                href="#"
                className="inline-flex min-h-[44px] items-center rounded-lg px-3 py-2 text-xs font-semibold text-[#64748B] outline-none transition-all duration-200 hover:bg-[#F1F5F9] hover:text-[#0052FF] focus-visible:ring-2 focus-visible:ring-[#0052FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAFA]"
              >
                {item}
              </a>
            ))}
          </div>

        </div>
      </div>
    </footer>
  );
}
