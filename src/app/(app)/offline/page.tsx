import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { OfflineRetryButton } from "@/components/pwa/OfflineRetryButton";

export const metadata: Metadata = {
  title: "Offline",
};

// Served by the service worker (public/sw.js) as the navigation fallback
// when a page request fails while offline — never implies diagnostic
// functionality works without a connection (see PWA_CACHING_POLICY.md).
export default async function OfflinePage() {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "pwaOffline" });

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex items-baseline gap-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
        <span className="text-[var(--accent-red)]">DTC</span>
        <span>Decoder</span>
      </div>
      <h1 className="mt-8 text-2xl font-bold text-[var(--text-primary)]">{t("heading")}</h1>
      <p className="mt-3 text-[var(--text-secondary)]">{t("body")}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <OfflineRetryButton label={t("retryButton")} />
        <Link
          href="/"
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          {t("homeButton")}
        </Link>
      </div>
    </div>
  );
}
