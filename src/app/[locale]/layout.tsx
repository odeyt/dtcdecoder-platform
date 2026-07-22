import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import {
  isRecognizedLocaleCode,
  directionForLocale,
  DEFAULT_LOCALE,
} from "@/lib/i18n/locale-codes";
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

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

// Root layout for the public/SEO content tree (homepage, /dtc, /[make]/
// [slug], /blog). A separate, fixed-English root layout exists for the
// (app) route group (account/admin/pricing/etc.) — one shared root layout
// can't vary <html lang/dir> per locale for one subtree while staying fixed
// for the other. proxy.ts rewrites unprefixed requests to /en/... first, so
// `locale` here is always a real path segment, never inferred.
//
// Only English has real translated content today (see the multilingual
// rollout plan) — every other recognized locale code still renders through
// this same tree structurally, but next-intl message catalogs and
// per-locale content don't exist yet outside English. That lands in a
// later slice; this one only proves the routing/layout split itself.
// Only English is a real, enabled locale today — pre-render that one
// statically (restoring the homepage's previous static generation) while
// leaving every other recognized-but-not-yet-live locale to render
// dynamically on demand rather than pre-building 53 empty variants.
export function generateStaticParams() {
  return [{ locale: DEFAULT_LOCALE }];
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isRecognizedLocaleCode(locale)) {
    notFound();
  }

  const direction = directionForLocale(locale);

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
