import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { DtcTechnicianShell } from "@/components/DtcTechnicianShell";
import {
  isRecognizedLocaleCode,
  isLiveLocale,
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
    default: "DTC Decoder — Professional Automotive Diagnostic Platform",
    template: "%s | DTC Decoder",
  },
  description:
    "Consult DTC Technician, import vehicle scans, look up diagnostic codes, and follow guided evidence-based vehicle diagnosis.",
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
// Only built locales (LIVE_LOCALES: messages/en.json, messages/es.json)
// have a real next-intl message catalog. proxy.ts now redirects every other
// recognized-but-unbuilt locale prefix to English before it reaches this
// layout, but the isLiveLocale() catalog fallback below stays as defense in
// depth for any direct/edge hit that bypasses the proxy.

// Only English is a real, enabled locale in the registry today — pre-render
// that one statically (restoring the homepage's previous static generation)
// while leaving every other recognized-but-not-yet-live locale to render
// dynamically on demand rather than pre-building 53 empty variants.
export function generateStaticParams() {
  return [{ locale: DEFAULT_LOCALE }];
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isRecognizedLocaleCode(locale)) {
    notFound();
  }

  // Required so that server-side useTranslations()/useFormatter() calls
  // inside this tree (SiteFooter, ServiceBayHero, page components) resolve
  // their locale from this cache instead of falling back to reading
  // next/headers() — which would force the whole tree dynamic.
  setRequestLocale(locale);

  const direction = directionForLocale(locale);
  const catalogLocale = isLiveLocale(locale) ? locale : DEFAULT_LOCALE;
  // Loaded directly (not via next-intl's async request-config derivation)
  // and passed as explicit props below — any *unset* NextIntlClientProvider
  // prop (now/timeZone/formats) triggers an internal getConfig() call that
  // reads a dynamic API (next/headers) as its fallback path, which would
  // silently force this entire statically-generated tree into per-request
  // dynamic rendering. Passing everything explicitly avoids that call
  // altogether and keeps the /en build genuinely static.
  const messages = (await import(`../../../messages/${catalogLocale}.json`)).default;

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="UTC"
          now={new Date()}
          formats={{}}
        >
          <SiteNav />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
          <DtcTechnicianShell />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
