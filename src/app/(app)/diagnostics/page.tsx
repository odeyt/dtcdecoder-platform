import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { listCasesForOwner, listVinsForCaseIds } from "@/lib/scan-diagnostics/cases";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getActiveSingleReportUnlocksForCases } from "@/lib/ai-diagnostics/single-report-purchases";
import { computeExpiryDays } from "@/lib/scan-diagnostics/retention";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { EditableCaseTitle } from "@/components/EditableCaseTitle";

export const metadata: Metadata = {
  title: "Diagnostic Cases",
  description: "Import a vehicle scan report and get a Professional Scan Analysis.",
};

export default async function DiagnosticsPage() {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  const cases = await listCasesForOwner(user.id);
  const vinByCaseId = await listVinsForCaseIds(cases.map((c) => c.id));
  const plan = await getEffectivePlan(user.id, user.email ?? null);
  const completedCaseIds = cases.filter((c) => c.status === "completed").map((c) => c.id);
  const singleReportUnlocks = await getActiveSingleReportUnlocksForCases(completedCaseIds);

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "scanCases" });

  const STATUS_LABELS: Record<string, string> = {
    draft: t("statusDraft"),
    uploaded: t("statusUploaded"),
    extracting: t("statusExtracting"),
    extraction_review: t("statusExtractionReview"),
    ready_for_analysis: t("statusReadyForAnalysis"),
    analyzing: t("statusAnalyzing"),
    // "completed" only means the AI analysis pipeline finished and a report
    // exists — it says nothing about whether a technician has reviewed it,
    // and the case stays fully editable (notes, test checkboxes,
    // verification checklist) after this. "Report ready" read as
    // final/locked to at least one technician, so this label is
    // deliberately softer than the actual manual-completion feature
    // (technician_completed_at) uses.
    completed: t("statusCompleted"),
    failed: t("statusFailed"),
  };

  function expiryDays(caseId: string, createdAt: string): number | null {
    return computeExpiryDays({ plan, createdAt, singleReportUnlockExpiresAt: singleReportUnlocks.get(caseId) });
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
              <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>
            </div>
          </div>

          <Link
            href="/diagnostics/upload"
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
          >
            {t("importVehicleScan")}
          </Link>

          {cases.length === 0 ? (
            <div className="glass-panel mt-8 rounded-[var(--radius-xl)] p-8 text-center">
              <p className="text-[var(--text-secondary)]">{t("noScansYet")}</p>
            </div>
          ) : (
            <ol className="mt-8 space-y-3">
              {cases.map((c) => {
                const title = c.title || c.complaint || t("untitledCase");
                const days = expiryDays(c.id, c.created_at);
                const vin = vinByCaseId[c.id];
                return (
                  <li key={c.id} className="glass-panel relative rounded-[var(--radius-lg)] transition hover:border-[var(--border-red)]">
                    {/* Full-card "stretched link" to the case detail page — kept
                        as a separate absolutely-positioned element (rather than
                        wrapping the whole card, the previous approach) so
                        EditableCaseTitle's button/input can sit in normal
                        document flow above it and handle their own clicks
                        without accidentally triggering navigation. The visible
                        content wrapper needs pointer-events-none (with
                        pointer-events-auto re-enabled only on EditableCaseTitle)
                        — otherwise, despite being positioned "above" the link
                        only by DOM order/no z-index, it still captures every
                        click within its bounds, and only genuinely empty
                        padding around the text would ever reach the link
                        underneath. */}
                    <Link
                      href={`/diagnostics/${c.id}`}
                      className="absolute inset-0 rounded-[var(--radius-lg)]"
                      aria-label={t("openCase", { title })}
                    />
                    <div className="relative flex items-center justify-between gap-4 p-4 pointer-events-none">
                      <div className="min-w-0 flex-1">
                        <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                        <div className="relative z-10 pointer-events-auto">
                          <EditableCaseTitle
                            caseId={c.id}
                            initialTitle={c.title}
                            fallback={c.complaint || t("untitledCase")}
                          />
                        </div>
                        {vin && (
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                            {t("vinPrefix", { vin })}
                          </p>
                        )}
                        {c.status === "completed" && days !== null && (
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{t("expiresInDays", { days })}</p>
                        )}
                      </div>
                      <time
                        dateTime={c.created_at}
                        className="shrink-0 font-mono text-xs text-[var(--text-muted)]"
                      >
                        {new Date(c.created_at).toLocaleDateString(locale)}
                      </time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
