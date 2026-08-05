"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { localizeContentHref } from "@/lib/i18n/localized-href";

// Shared body for both src/app/[locale]/not-found.tsx and
// src/app/(app)/not-found.tsx. A segment-level not-found.tsx is still
// wrapped by that segment's own root layout (and its NextIntlClientProvider,
// already resolved for the right locale — URL segment for [locale], cookie/
// account preference for (app)) even though Next.js gives the not-found
// component itself no params/props, so useLocale()/useTranslations() here
// resolve correctly without needing to re-derive the locale independently.
export function NotFoundContent() {
  const t = useTranslations("notFoundPage");
  const locale = useLocale();
  const href = (path: string) => localizeContentHref(path, locale);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="glass-panel rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-10">
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--accent-red)]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-xl font-bold text-[var(--text-primary)]">{t("heading")}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("body")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={href("/")}
            className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {t("backHomeCta")}
          </Link>
          <Link
            href={href("/dtc")}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-white/5"
          >
            {t("searchCta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
