import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { DtcTechnicianShell } from "@/components/DtcTechnicianShell";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { directionForLocale } from "@/lib/i18n/locale-codes";
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

// Root layout for the account/admin/billing app shell — a route group
// (no URL segment: /account still serves at /account), deliberately kept
// separate from the [locale]-nested public content tree. Interface language
// for this shell is preference/cookie-driven, not URL-prefixed (see the
// multilingual rollout plan): resolveAppShellLocale() resolves a saved
// account preference (Pro/Workshop), then the anonymous dtc_interface_locale
// cookie set by the language switcher, then English.
//
// Reading that (cookies + auth) opts the whole (app) tree into per-request
// dynamic rendering — a deliberate trade accepted so the shell can render in
// the user's chosen language. Explicit locale/messages/timeZone/now/formats
// props (a standalone NextIntlClientProvider usage) rather than the
// request-config auto-derivation, so every child server-component
// useTranslations() call resolves against this catalog.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await resolveAppShellLocale();
  setRequestLocale(locale);
  const messages = await getAppShellMessages(locale);
  const direction = directionForLocale(locale);

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
