import type { Metadata } from "next";
// Local, vendored font files (latin subsets, same faces/weights/display that
// next/font/google emitted) — build no longer depends on fonts.googleapis.com
// reachability. That external fetch made CI and Vercel builds fail
// non-deterministically (Next 16 Turbopack font download). Provenance and
// checksums: app/fonts/README.md.
import localFont from "next/font/local";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";

const calistoga = localFont({
  variable: "--font-calistoga",
  display: "swap",
  src: [{ path: "./fonts/calistoga-latin-400-normal.woff2", weight: "400", style: "normal" }],
});

const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  src: [
    { path: "./fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
});

export const metadata: Metadata = {
  // Review M1-07: never leak one-time OAuth codes via Referer.
  referrer: "no-referrer",
  title: "Quizopia — Interactive Quiz Platform",
  description: "Experience learning with interactive, responsive, and beautiful soft-UI quiz interface.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${calistoga.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/* DESIGN_NEXT body — globals.css body rule sets bg #FAFAFA + foreground #0F172A.
          suppressHydrationWarning: browser extensions (Bitdefender, Grammarly, etc.) inject
          attributes (__processed_*, bis_register) into <body>/<html> before React hydrates,
          causing false hydration mismatches. This is the standard Next.js fix. */}
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-[#FAFAFA] text-[#0F172A] font-sans selection:bg-[#0052FF]/20">
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
