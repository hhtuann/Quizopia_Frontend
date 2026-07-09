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
      className={`${calistoga.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/*
        DESIGN_NEXT body bg (#FAFAFA) + foreground (#0F172A). globals.css ships an
        UNLAYERED body rule that sets background-color to var(--color-background), which
        is #E0E5EC (out of FE-R2 scope to edit). Unlayered CSS beats Tailwind utilities,
        so the inline style is what actually flips the body. ClassNames mirror the values.
      */}
      <body
        className="min-h-full flex flex-col bg-[#FAFAFA] text-[#0F172A] font-sans selection:bg-[#0052FF]/20"
        style={{ backgroundColor: "#FAFAFA", color: "#0F172A" }}
      >
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
