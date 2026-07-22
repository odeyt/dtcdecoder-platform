import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DTC Decoder — AI-Powered Automotive Diagnostic Intelligence",
    template: "%s | DTC Decoder",
  },
  description:
    "Instantly decode fault codes, understand symptoms, find common causes, and follow professional diagnostic steps before replacing parts.",
};

// Root layout for the account/admin/billing app shell — a route group
// (no URL segment: /account still serves at /account), deliberately kept
// separate from the [locale]-nested public content tree so this subtree can
// stay fixed-English while the public tree varies <html lang/dir> by
// locale. Interface language for this shell is preference/cookie-driven,
// not URL-prefixed (see the multilingual rollout plan) — that wiring lands
// alongside next-intl in a later slice.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
