import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getAiDiagnosticUsageSummary, toLegacyUsageSummary } from "@/lib/ai-diagnostics/usage";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { PricingPlans } from "@/components/PricingPlans";
import { UsageMeter } from "@/components/UsageMeter";

// Locale-aware (reads the same resolved preference/cookie as the page body)
// but no hreflang/canonical alternates here — (app)-tree routes don't have
// per-locale URLs (see the multilingual rollout plan), so there's nothing
// for search engines to disambiguate between.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("pricingTitle"), description: t("pricingDescription") };
}

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user);

  const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : null;
  const usage =
    user && plan ? toLegacyUsageSummary(await getAiDiagnosticUsageSummary(user.id, plan)) : null;

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "pricing" });
  const planLabelKey = plan === "pro" ? "planPro" : plan === "workshop" ? "planWorkshop" : "planFree";

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="container-app px-6 py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">{t("title")}</h1>
          <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>
        </div>

        {plan && usage && (
          <div className="mx-auto mt-8 max-w-sm">
            <p className="text-center text-sm text-[var(--text-secondary)]">
              {t("yourPlan", { plan: t(planLabelKey) })}
            </p>
            <div className="mt-3">
              <UsageMeter summary={usage} planLabel={t(planLabelKey)} />
            </div>
          </div>
        )}

        <div className="mt-12">
          <PricingPlans signedIn={signedIn} />
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
