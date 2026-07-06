"use client";

import React, { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("dashboard");

  const mobileNavItems = [
    { id: "dashboard", label: "Dashboard" },
    { id: "quizzes", label: "My Quizzes" },
    { id: "create", label: "Create Quiz" },
    { id: "history", label: "History" },
    { id: "leaderboard", label: "Leaderboard" },
    { id: "settings", label: "Settings" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-[#E0E5EC] text-[#3D4852]">
      
      {/* Header component */}
      <Header isMobileMenuOpen={isMobileMenuOpen} setIsMobileMenuOpen={setIsMobileMenuOpen} />

      {/* Main Layout Area */}
      <div className="flex flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        
        {/* Desktop Sidebar (hidden on mobile) */}
        <Sidebar currentTab={currentTab} onTabChange={(tab) => setCurrentTab(tab)} />

        {/* Content Panel Area */}
        <main className="flex-1 flex flex-col py-8 px-2 md:px-8 overflow-x-hidden min-w-0">
          <div className="flex-1">
            {children}
          </div>
          <Footer />
        </main>
      </div>

      {/* Mobile Drawer Overlay / Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-x-0 top-20 z-30 p-4 animate-fadeIn">
          <nav id="mobile-navigation" className="rounded-container bg-[#E0E5EC] p-6 shadow-extruded space-y-3">
            <p className="text-xs font-bold text-[#6B7280] tracking-wider uppercase pl-2 mb-2">Navigation</p>
            {mobileNavItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-5 py-4 rounded-button text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[#6C63FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#E0E5EC] outline-none transition-all duration-300 ${
                    isActive
                      ? "shadow-inset-pressed text-[#6C63FF] translate-y-[0.5px]"
                      : "shadow-extruded-small text-[#6B7280] hover:text-[#3D4852] active:shadow-inset-small"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

    </div>
  );
}
