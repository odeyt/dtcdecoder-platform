import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getUserPreferences, DEFAULT_PREFERENCES } from "@/lib/preferences";
import { listAllLanguages, listAllCurrencies } from "@/lib/i18n/languages";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Language &amp; Region Preferences
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Choose your interface language, AI report language, and display currency.
        </p>
      </div>

      <AccountPreferencesForm plan={plan} preferences={preferences} languages={languages} currencies={currencies} />
    </div>
  );
}
