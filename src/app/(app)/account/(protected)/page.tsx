import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getAiDiagnosticUsageSummary, toLegacyUsageSummary } from "@/lib/ai-diagnostics/usage";
import { getAddOnBalanceSummary } from "@/lib/ai-diagnostics/addon-balances";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { UsageMeter } from "@/components/UsageMeter";
import { UpgradeCard } from "@/components/UpgradeCard";
import { AddOnPackButton } from "@/components/AddOnPackButton";
import { ADD_ON_PACKS } from "@/lib/pricing";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout above already redirects if there's no user, so this is just
  // satisfying the type — user is guaranteed here at runtime.
  const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : "free";
  const usage = user ? toLegacyUsageSummary(await getAiDiagnosticUsageSummary(user.id, plan)) : null;
  const nearLimit = usage ? usage.used / usage.limit >= 0.8 : false;
  // Free never gets any AI diagnostic report generation at all, so add-on
  // credits would be unusable — only shown to paid plans.
  const addOnBalance = user && plan !== "free" ? await getAddOnBalanceSummary(user.id) : null;

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "account" });
  const tp = await getTranslations({ locale, namespace: "pricing" });
  const planLabelKey = plan === "pro" ? "planPro" : plan === "workshop" ? "planWorkshop" : "planFree";
  const planLabel = tp(planLabelKey);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="mt-2 text-[var(--text-secondary)]">{user?.email}</p>
        </div>

        <div className="glass-panel rounded-[var(--radius-xl)] p-6">
          <p className="text-sm text-[var(--text-secondary)]">{t("currentPlan")}</p>
          <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{planLabel}</p>
          {plan === "free" && (
            <Link
              href="/pricing"
              className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              {t("upgradeToPro")}
            </Link>
          )}
        </div>

        {usage && <UsageMeter summary={usage} planLabel={planLabel} />}

        {nearLimit && plan === "free" && <UpgradeCard reason={t("nearLimitReason")} />}

        {addOnBalance && (
          <div className="glass-panel rounded-[var(--radius-xl)] p-6">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t("addOnTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{t("addOnDescription")}</p>
            <p className="mt-3 text-lg font-bold text-[var(--text-primary)]">
              {t("addOnBalance", { count: addOnBalance.totalReportsRemaining })}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {ADD_ON_PACKS.map((pack) => (
                <AddOnPackButton
                  key={pack.id}
                  packId={pack.id}
                  label={`${t("addOnBuy")} — ${pack.reports} / $${pack.priceUsd}`}
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-6 text-sm">
          <Link href="/ai-assistant" className="text-[var(--accent-red)] underline">
            {t("goToAiAssistant")}
          </Link>
          <Link href="/history" className="text-[var(--accent-red)] underline">
            {t("viewHistory")}
          </Link>
          <Link href="/account/preferences" className="text-[var(--accent-red)] underline">
            {t("languagePreferences")}
          </Link>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
