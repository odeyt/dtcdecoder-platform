import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getUserPreferences, DEFAULT_PREFERENCES } from "@/lib/preferences";
import { listAllLanguages, listAllCurrencies } from "@/lib/i18n/languages";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { getDisplayPriceEstimate } from "@/lib/currency";
import { PAID_PLANS } from "@/lib/pricing";
import { AccountPreferencesForm } from "@/components/AccountPreferencesForm";

export const metadata: Metadata = {
  title: "Language & Region Preferences",
  description: "Your interface language, AI report language, region, and currency preferences.",
};

export default async function AccountPreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout above already redirects if there's no user.
  const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : "free";
  const saved = user ? await getUserPreferences(user.id) : null;
  const preferences = saved ?? { user_id: user?.id ?? "", ...DEFAULT_PREFERENCES, created_at: "", updated_at: "" };

  // Full catalogs — including disabled/Tier-4 rows and disabled currencies
  // — so the form can render locked previews ("French — coming soon"), not
  // just the currently-active subset.
  const [languages, currencies] = await Promise.all([listAllLanguages(), listAllCurrencies()]);

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "preferences" });

  // A representative example (Pro's monthly USD price) shown in the
  // currently-saved display currency — a real estimate computed from the
  // admin-entered rate (or a USD fallback when none exists), never a fake
  // number. Recomputed against whichever currency the user has actually
  // saved, not the form's live (unsaved) selection.
  const priceEstimate = await getDisplayPriceEstimate(
    PAID_PLANS.pro.monthlyPriceUsd,
    preferences.preferred_currency ?? "USD",
    currencies.find((c) => c.code === preferences.preferred_currency)?.decimal_places ?? 2,
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>
        </div>

        <AccountPreferencesForm
          plan={plan}
          preferences={preferences}
          languages={languages}
          currencies={currencies}
          priceEstimate={priceEstimate}
        />
      </div>
    </NextIntlClientProvider>
  );
}
