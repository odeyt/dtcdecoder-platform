import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { env } from "@/lib/env";
import { getCaseDetail } from "@/lib/scan-diagnostics/cases";
import { resolveReportAccess } from "@/lib/scan-diagnostics/report-access";
import { getFeedbackForCase } from "@/lib/scan-diagnostics/feedback";
import {
  getCompletionSummary,
  listCauseStatus,
  listNotes,
  listTestProgress,
  getVerification,
} from "@/lib/scan-diagnostics/workbench";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { getActiveSingleReportUnlock } from "@/lib/ai-diagnostics/single-report-purchases";
import { computeExpiryDays } from "@/lib/scan-diagnostics/retention";
import { getAllowedOutputLocales } from "@/lib/i18n/languages";
import { ScanCaseActionBar } from "@/components/ScanCaseActionBar";
import { ScanExtractionReviewForm } from "@/components/ScanExtractionReviewForm";
import { ScanReportView } from "@/components/ScanReportView";
import { ScanFeedbackForm } from "@/components/ScanFeedbackForm";
import { ScanPrintButton } from "@/components/ScanPrintButton";
import { ScanReportLanguageSwitcher } from "@/components/ScanReportLanguageSwitcher";
import { UpgradeCard } from "@/components/UpgradeCard";

export const metadata: Metadata = { title: "Diagnostic Case" };

interface PageProps {
  params: Promise<{ caseId: string }>;
}

export default async function DiagnosticsCasePage({ params }: PageProps) {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  const detail = await getCaseDetail(user.id, caseId);
  const { case: scanCase, extraction, dtcRecords } = detail;

  const plan = await getEffectivePlan(user.id, user.email ?? null);
  const reportAccess = await resolveReportAccess(user.id, user.email ?? null, detail);
  const feedback = scanCase.status === "completed" ? await getFeedbackForCase(user.id, caseId) : null;
  const singleReportUnlock = scanCase.status === "completed" ? await getActiveSingleReportUnlock(caseId) : null;
  const expiryDays =
    scanCase.status === "completed"
      ? computeExpiryDays({ plan, createdAt: scanCase.created_at, singleReportUnlockExpiresAt: singleReportUnlock?.expiresAt })
      : null;
  const availableLocales =
    scanCase.status === "completed" && reportAccess?.accessLevel === "full" ? await getAllowedOutputLocales(plan) : [];

  // Workbench persistence only applies to a full-access, completed report —
  // a Free-preview viewer or a case without a generated report has nothing
  // to fetch here. Wrapped defensively: these all assume a scan_reports row
  // exists (true whenever status is "completed" — see analyze.ts), but a
  // page render should never 500 on that assumption.
  const workbench =
    scanCase.status === "completed" && reportAccess?.accessLevel === "full"
      ? await (async () => {
          try {
            const [testProgress, causeStatus, notes, verification, completionSummary] = await Promise.all([
              listTestProgress(user.id, caseId),
              listCauseStatus(user.id, caseId),
              listNotes(user.id, caseId),
              getVerification(user.id, caseId),
              getCompletionSummary(user.id, caseId),
            ]);
            return { testProgress, causeStatus, notes, verification, completionSummary };
          } catch {
            return undefined;
          }
        })()
      : undefined;

  const locale = await resolveAppShellLocale();
  const messages = await getAppShellMessages(locale);
  const t = await getTranslations({ locale, namespace: "scanCases" });

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" now={new Date()} formats={{}}>
      <div className="container-app px-6 py-16 print:py-0">
        <div className="mx-auto max-w-3xl">
          <div className="print:hidden">
            <Link href="/diagnostics" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              ← {t("allCases")}
            </Link>
          </div>

          {scanCase.status === "draft" && (
            <div className="glass-panel mt-6 rounded-[var(--radius-xl)] p-8 text-center">
              <p className="text-[var(--text-secondary)]">{t("draftNoUpload")}</p>
              <Link
                href="/diagnostics/upload"
                className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white"
              >
                {t("startNewUpload")}
              </Link>
            </div>
          )}

          {["uploaded", "extracting", "ready_for_analysis", "analyzing", "failed"].includes(scanCase.status) && (
            <div className="mt-6">
              <ScanCaseActionBar
                caseId={scanCase.id}
                status={scanCase.status}
                hasExtraction={Boolean(extraction)}
                errorMessage={scanCase.error_message}
                canAnalyze={canAccessFullDiagnostics(plan)}
              />
            </div>
          )}

          {scanCase.status === "extraction_review" && extraction && (
            <div className="mt-6">
              <ScanExtractionReviewForm caseId={scanCase.id} extraction={extraction} dtcRecords={dtcRecords} />
            </div>
          )}

          {scanCase.status === "completed" && reportAccess && (
            <div className="mt-6 flex flex-col gap-8">
              {expiryDays !== null && (
                <p className="text-xs text-[var(--text-muted)] print:hidden">{t("expiresInDays", { days: expiryDays })}</p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-3 print:hidden">
                {/* Gated on the report's actual resolved access level, not
                    the viewer's plan directly — a valid single-report
                    purchase already forces accessLevel to "full" for this
                    one case regardless of plan (see resolveReportAccess),
                    so re-deriving from plan here would incorrectly hide
                    these for an unlocked Free-tier buyer. */}
                {reportAccess.accessLevel === "full" ? (
                  <>
                    <ScanReportLanguageSwitcher
                      caseId={scanCase.id}
                      currentLanguage={scanCase.report_language}
                      availableLocales={availableLocales}
                    />
                    <ScanPrintButton />
                  </>
                ) : (
                  <UpgradeCard reason={t("upgradeExportReason")} />
                )}
              </div>
              <ScanReportView
                scanCase={scanCase}
                extraction={extraction}
                dtcRecords={dtcRecords}
                reportAccess={reportAccess}
                workbench={workbench}
              />
              <div className="print:hidden">
                <ScanFeedbackForm caseId={scanCase.id} existingFeedback={feedback} />
              </div>
            </div>
          )}
        </div>

        <style>{`
          @media print {
            nav, header { display: none !important; }
          }
        `}</style>
      </div>
    </NextIntlClientProvider>
  );
}
