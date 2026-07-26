import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { env } from "@/lib/env";
import { getCaseDetail } from "@/lib/scan-diagnostics/cases";
import { resolveReportAccess } from "@/lib/scan-diagnostics/report-access";
import { getFeedbackForCase } from "@/lib/scan-diagnostics/feedback";
import { canExportScanReport } from "@/lib/scan-diagnostics/entitlements";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { ScanCaseActionBar } from "@/components/ScanCaseActionBar";
import { ScanExtractionReviewForm } from "@/components/ScanExtractionReviewForm";
import { ScanReportView } from "@/components/ScanReportView";
import { ScanFeedbackForm } from "@/components/ScanFeedbackForm";
import { ScanPrintButton } from "@/components/ScanPrintButton";
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

  return (
    <div className="container-app px-6 py-16 print:py-0">
      <div className="mx-auto max-w-3xl">
        <div className="print:hidden">
          <Link href="/diagnostics" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            ← All cases
          </Link>
        </div>

        {scanCase.status === "draft" && (
          <div className="glass-panel mt-6 rounded-[var(--radius-xl)] p-8 text-center">
            <p className="text-[var(--text-secondary)]">This case doesn&apos;t have an uploaded file yet.</p>
            <Link
              href="/diagnostics/upload"
              className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white"
            >
              Start a new upload
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
            <div className="flex justify-end print:hidden">
              {canExportScanReport(plan) ? (
                <ScanPrintButton />
              ) : (
                <UpgradeCard reason="Upgrade to Pro or Workshop to export and print your diagnostic report." />
              )}
            </div>
            <ScanReportView
              scanCase={scanCase}
              extraction={extraction}
              dtcRecords={dtcRecords}
              reportAccess={reportAccess}
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
  );
}
