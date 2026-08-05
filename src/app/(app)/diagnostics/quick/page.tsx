import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { getAllowedOutputLocales } from "@/lib/i18n/languages";
import { resolveDefaultReportLanguage } from "@/lib/i18n/ai-language-server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { env } from "@/lib/env";
import { notFound } from "next/navigation";
import { QuickDiagnosticForm } from "@/components/QuickDiagnosticForm";
import { recordEvent } from "@/lib/analytics/events";

export const metadata: Metadata = { title: "Run Full Professional Diagnosis" };

type Props = {
  searchParams: Promise<{
    code?: string;
    make?: string;
    model?: string;
    modelYear?: string;
    engine?: string;
    returnTo?: string;
  }>;
};

// The "Run Full Professional Diagnosis" entry point linked from DTC search results
// (known-code page, unknown-code fallback, and the main search page).
// Three states, matching the spec exactly: unauthenticated -> sign-in
// (preserving this exact URL, DTC code included, via the next= param —
// see /account/auth/callback), authenticated-but-Free -> upgrade prompt
// (the DTC code stays in the URL, so it's still here after upgrading and
// clicking back), authenticated-and-paid -> the real form.
export default async function QuickDiagnosticPage({ searchParams }: Props) {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const params = await searchParams;
  const currentUrl = `/diagnostics/quick?${new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString()}`;

  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "quickDiagnostic" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("pageTitle")}</h1>
          <p className="mt-3 text-[var(--text-secondary)]">
            {params.code ? t("signInBodyWithCode", { code: params.code }) : t("signInBody")}
          </p>
          <Link
            href={`/account/login?next=${encodeURIComponent(currentUrl)}`}
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {t("signInCta")}
          </Link>
        </div>
      </div>
    );
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  if (!canAccessFullDiagnostics(plan)) {
    await recordEvent("upgrade_prompt_viewed", { userId: user.id, metadata: { source: "diagnostics_quick", plan } });
    return (
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("pageTitle")}</h1>
          <p className="mt-3 text-[var(--text-secondary)]">
            {params.code ? t("upgradeBodyWithCode", { code: params.code }) : t("upgradeBody")}
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            {tCommon("viewPlans")}
          </Link>
        </div>
      </div>
    );
  }

  const locales = await getAllowedOutputLocales(plan);
  const languageOptions = locales.map((l) => ({ code: l.locale_code, name: l.english_name }));
  // Pre-select whatever this account/region/UI already resolves to, rather
  // than always defaulting the dropdown to English — same resolution used
  // for the file-upload path's server-side default (ai-language-server.ts).
  const defaultReportLanguage = await resolveDefaultReportLanguage(user.id, user.email ?? null);

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("pageTitle")}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t("formIntro")}</p>
        <div className="mt-8">
          <QuickDiagnosticForm
            prefill={{
              dtcCode: params.code ?? "",
              make: params.make ?? "",
              model: params.model ?? "",
              modelYear: params.modelYear ?? "",
              engine: params.engine ?? "",
            }}
            languageOptions={languageOptions}
            defaultReportLanguage={defaultReportLanguage}
          />
        </div>
      </div>
    </div>
  );
}
