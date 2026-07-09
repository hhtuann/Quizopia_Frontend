import type { Metadata } from "next";
import { Calistoga, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";

const calistoga = Calistoga({
  variable: "--font-calistoga",
  subsets: ["latin"],
  display: "swap",
  weight: ["400"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
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
