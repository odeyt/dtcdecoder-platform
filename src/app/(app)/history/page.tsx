import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listSearchHistory } from "@/lib/search-history";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

export const metadata: Metadata = {
  title: "Search History",
  description: "Your recent DTC lookups and AI diagnostic questions.",
};

export default async function HistoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  const entries = await listSearchHistory(user.id);

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "history" });

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>

          {entries.length === 0 ? (
            <div className="glass-panel mt-8 rounded-[var(--radius-xl)] p-8 text-center">
              <p className="text-[var(--text-secondary)]">{t("empty")}</p>
              <Link
                href="/dtc"
                className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
              >
                {t("decodeACode")}
              </Link>
            </div>
          ) : (
            <ol className="mt-8 space-y-3">
              {entries.map((entry) => (
                <li key={entry.id} className="glass-panel rounded-[var(--radius-lg)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {entry.kind === "ai" ? t("aiQuestion") : t("lookup")}
                      </span>
                      {entry.dtc_code ? (
                        <Link
                          href={
                            entry.dtc_code.make
                              ? `/${entry.dtc_code.make}/${entry.dtc_code.slug}`
                              : `/dtc/${entry.dtc_code.slug}`
                          }
                          className="mt-1 block font-medium text-[var(--text-primary)] hover:text-[var(--accent-red)]"
                        >
                          {entry.query}
                        </Link>
                      ) : (
                        <p className="mt-1 font-medium text-[var(--text-primary)]">{entry.query}</p>
                      )}
                    </div>
                    <time
                      dateTime={entry.created_at}
                      className="shrink-0 font-mono text-xs text-[var(--text-muted)]"
                    >
                      {new Date(entry.created_at).toLocaleDateString(locale)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
