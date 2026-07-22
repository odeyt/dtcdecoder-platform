import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import enMessages from "../../../messages/en.json";
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
// not URL-prefixed (see the multilingual rollout plan) — reading a real
// stored preference lands in a later slice; fixed to English for now since
// SiteNav/SiteFooter (shared with the [locale] tree) need a next-intl
// context to render at all. Explicit locale/messages/timeZone/now/formats
// props (a standalone NextIntlClientProvider usage) rather than the
// request-config auto-derivation — any *unset* provider prop, or a plain
// server-side useTranslations() call without setRequestLocale(), triggers
// an internal getConfig() call that reads next/headers() as its fallback,
// which would force this entire (app) tree into per-request dynamic
// rendering.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  setRequestLocale("en");

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider
          locale="en"
          messages={enMessages}
          timeZone="UTC"
          now={new Date()}
          formats={{}}
        >
          <SiteNav />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
