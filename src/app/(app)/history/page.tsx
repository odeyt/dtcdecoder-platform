import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { listSearchHistory } from "@/lib/search-history";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { HistoryList } from "@/components/HistoryList";

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

          <HistoryList initialEntries={entries} locale={locale} />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
