import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { searchDtcCodes } from "@/lib/dtc";
import { incrementDtcSearchCount } from "@/lib/admin-dtc";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const alternates = await buildLocaleAlternates(locale, "/dtc");

  return {
    title: t("dtcSearchTitle"),
    description: t("dtcSearchDescription"),
    alternates,
  };
}

export default async function DtcLookupPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await searchDtcCodes(query) : [];
  const t = await getTranslations({ locale, namespace: "dtcSearch" });

  if (query && results[0]) {
    incrementDtcSearchCount(results[0].id).catch(() => {});
  }

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>

        <form className="mt-6 flex gap-3">
          <label htmlFor="dtc-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="dtc-search"
            type="text"
            name="q"
            defaultValue={query}
            placeholder={t("placeholder")}
            className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
          >
            {t("decode")}
          </button>
        </form>

        {query && results.length === 0 && (
          <p className="mt-8 text-[var(--text-secondary)]">
            {t("noResults", { query })}{" "}
            <Link href="/ai-assistant" className="text-[var(--accent-red)] underline">
              {t("askAiAssistant")}
            </Link>
            .
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-8 space-y-3">
            {results.map((dtc) => (
              <li key={dtc.id}>
                <Link
                  href={dtc.make ? `/${dtc.make}/${dtc.slug}` : `/dtc/${dtc.slug}`}
                  className="glass-panel block rounded-[var(--radius-lg)] p-4 transition hover:bg-white/5"
                >
                  <p className="font-mono text-sm text-[var(--accent-red)]">
                    {dtc.code}
                    {dtc.make ? ` · ${dtc.make.toUpperCase()}` : ""}
                  </p>
                  <p className="mt-1 font-semibold text-[var(--text-primary)]">{dtc.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {dtc.meaning}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
