import React from "react";
import AppShell from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";

export default function Home() {
  return (
    <RequireAuth>
      <AppShell>
      {/* Welcome Section */}
      <div className="mb-10 select-none">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight text-[#3D4852]">
          Dashboard Overview
        </h1>
        <p className="text-sm sm:text-base text-[#6B7280] mt-2 font-medium">
          Welcome back, <span className="font-semibold text-[#6C63FF]">John Doe</span>! Let&apos;s explore your quiz progress and design system components.
        </p>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Card 1: Performance Statistics */}
        <div className="rounded-container bg-[#E0E5EC] p-8 shadow-extruded flex flex-col justify-between min-h-[300px] transition-all duration-300 hover:-translate-y-1 hover:shadow-extruded-hover">
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Your Progress</span>
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#38B2AC] animate-ping" />
            </div>
            
            <h2 className="font-display font-bold text-xl text-[#3D4852] mb-6">Performance stats</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#E0E5EC] shadow-inset-pressed">
                <span className="block text-xs font-semibold text-[#6B7280]">Total Quizzes</span>
                <span className="block text-2xl font-extrabold text-[#3D4852] mt-1">42</span>
              </div>
              <div className="p-4 rounded-xl bg-[#E0E5EC] shadow-inset-pressed">
                <span className="block text-xs font-semibold text-[#6B7280]">Accuracy Rate</span>
                <span className="block text-2xl font-extrabold text-[#38B2AC] mt-1">87.5%</span>
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between text-xs font-semibold text-[#6B7280]">
            <span>Next milestone: 50 Quizzes</span>
            <span className="text-[#6C63FF]">84% complete</span>
          </div>
        </div>

        {/* Card 2: Interactive Element Showcase */}
        <div className="rounded-container bg-[#E0E5EC] p-8 shadow-extruded flex flex-col justify-between min-h-[300px] transition-all duration-300 hover:-translate-y-1 hover:shadow-extruded-hover">
          <div>
            <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block mb-6">Design Tokens</span>
            <h2 className="font-display font-bold text-xl text-[#3D4852] mb-6">Interactive States</h2>
            
            <div className="flex flex-col gap-4">
              {/* Secondary resting button */}
              <button className="w-full h-12 rounded-button bg-[#E0E5EC] shadow-extruded text-sm font-semibold text-[#3D4852] hover:-translate-y-0.5 hover:shadow-extruded-hover active:translate-y-[0.5px] active:shadow-inset-small focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300 neumorphic-active-press">
                Secondary Raised Button
              </button>

              {/* Primary active/accent button */}
              <button className="w-full h-12 rounded-button bg-[#6C63FF] text-white text-sm font-semibold hover:bg-[#8B84FF] transition-all duration-300 shadow-extruded-small active:translate-y-[0.5px] focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none">
                Primary Accent Button
              </button>

              {/* Inset pressed mock button */}
              <div className="w-full h-12 flex items-center justify-center rounded-button bg-[#E0E5EC] shadow-inset-pressed text-sm font-semibold text-[#6B7280]">
                Pressed / Inset State
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Forms & Input Elements */}
        <div className="rounded-container bg-[#E0E5EC] p-8 shadow-extruded flex flex-col justify-between min-h-[300px] transition-all duration-300 hover:-translate-y-1 hover:shadow-extruded-hover">
          <div>
            <span className="text-xs font-bold text-[#6B7280] uppercase tracking-wider block mb-6">Forms</span>
            <h2 className="font-display font-bold text-xl text-[#3D4852] mb-6">Input Elements</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2 pl-1">USERNAME</label>
                <input
                  type="text"
                  defaultValue="johndoe_quiz"
                  className="w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] outline-none shadow-inset-pressed focus:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2 pl-1">PASSPHRASE</label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full h-12 rounded-button bg-[#E0E5EC] px-4 text-sm text-[#3D4852] placeholder-[#A0AEC0] outline-none shadow-inset-pressed focus:shadow-inset-deep focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Decorative / Concentric Circles Section */}
      <div className="mt-12 p-8 rounded-container bg-[#E0E5EC] shadow-extruded flex flex-col md:flex-row items-center gap-8 justify-between">
        <div className="max-w-md select-none text-center md:text-left">
          <span className="text-xs font-bold text-[#38B2AC] uppercase tracking-wider">Tactile Depth System</span>
          <h2 className="font-display font-extrabold text-2xl text-[#3D4852] mt-2">Soft UI Layer Physics</h2>
          <p className="text-sm text-[#6B7280] mt-3 leading-relaxed">
            By layering extruded and inset shadows on monochromatic base surfaces, we create physical depth and realism without color clutter.
          </p>
        </div>

        {/* Complex nested depth layout */}
        <div className="flex items-center justify-center">
          <div className="relative w-48 h-48 rounded-container bg-[#E0E5EC] shadow-extruded flex items-center justify-center">
            {/* Mid circle (inset) */}
            <div className="w-36 h-36 rounded-full bg-[#E0E5EC] shadow-inset-deep flex items-center justify-center">
              {/* Inner raised circle */}
              <div className="w-24 h-24 rounded-full bg-[#E0E5EC] shadow-extruded flex items-center justify-center">
                {/* Center inset button */}
                <div className="w-12 h-12 rounded-full bg-[#E0E5EC] shadow-inset-small text-[#6C63FF] flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5 animate-pulse">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </AppShell>
    </RequireAuth>
  );
}
