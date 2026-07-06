import React from "react";

export default function Footer() {
  return (
    <footer className="w-full bg-[#E0E5EC] py-8 border-t-0 mt-auto select-none">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          
          {/* Logo / Brand Name */}
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-[#3D4852]">
              © {new Date().getFullYear()} Quizopia. All rights reserved.
            </p>
            <p className="text-xs text-[#6B7280] mt-1">
              Crafted with Soft UI Neumorphic Design.
            </p>
          </div>

          {/* Quick Footer Links in Neumorphic small buttons/tracks */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            {["Terms", "Privacy", "Help Center", "Contact"].map((item) => (
              <a
                key={item}
                href="#"
                className="inline-flex items-center min-h-[44px] px-4 py-3 text-xs font-semibold text-[#6B7280] rounded-xl bg-[#E0E5EC] shadow-extruded-small hover:-translate-y-0.5 hover:shadow-extruded hover:text-[#3D4852] active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300"
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
