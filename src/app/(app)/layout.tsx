import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { DtcTechnicianShell } from "@/components/DtcTechnicianShell";
import { RegionGeoBanner } from "@/components/RegionGeoBanner";
import { PwaShell } from "@/components/pwa/PwaShell";
import { CapacitorAppLinks } from "@/components/capacitor/CapacitorAppLinks";
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
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

// PWA installability layer — see src/app/manifest.ts + public/sw.js.
export const viewport: Viewport = {
  themeColor: "#08080a",
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
          {/* Client component, no server data read — safe inside this
              shared layout without opting currently-static (app) pages
              (login, privacy, terms, ...) into dynamic rendering. See
              RegionGeoBanner.tsx. */}
          <RegionGeoBanner />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
          <DtcTechnicianShell />
          <PwaShell />
          <CapacitorAppLinks />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
