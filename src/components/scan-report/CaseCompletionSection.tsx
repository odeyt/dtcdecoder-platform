"use client";

// Case Completion — shows the real, server-computed readiness summary
// (getCompletionSummary) before the technician explicitly marks the case
// complete. readyToComplete is advisory only, never a hard gate — a
// technician may have a genuine reason to close a case with some steps
// intentionally skipped. This never completes a case silently; only an
// explicit click on "Mark case complete" calls the API.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { markCaseComplete } from "@/lib/scan-diagnostics/workbench-client";
import { useWorkbenchSaveStatus, withSaveStatus } from "@/components/scan-report/WorkbenchSaveStatus";
import type { CompletionSummary } from "@/lib/scan-diagnostics/workbench";

interface CaseCompletionSectionProps {
  caseId: string;
  summary: CompletionSummary;
  initialCompletedAt: string | null;
}

export function CaseCompletionSection({ caseId, summary, initialCompletedAt }: CaseCompletionSectionProps) {
  const [completedAt, setCompletedAt] = useState(initialCompletedAt);
  const { report, reportSaving } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  async function handleComplete() {
    const result = await withSaveStatus(report, reportSaving, async () => {
      await markCaseComplete(caseId);
      return true;
    });
    if (result) setCompletedAt(new Date().toISOString());
  }

  if (completedAt) {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          {t("caseMarkedComplete", { date: new Date(completedAt).toLocaleString() })}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <ul className="grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
        <li>
          {t("testsCompleted", { completed: summary.completedTests, total: summary.totalTests })}
          {summary.failedTests > 0 ? t("failedCount", { count: summary.failedTests }) : ""}
        </li>
        <li>{t("causesUnresolved", { unresolved: summary.unresolvedCauses, total: summary.totalCauses })}</li>
        <li>{t("verificationProgress", { completed: summary.verificationCompleted, total: summary.verificationTotal })}</li>
      </ul>
      {!summary.readyToComplete && <p className="mt-3 text-xs text-[var(--text-muted)]">{t("notReadyNote")}</p>}
      <button
        type="button"
        onClick={handleComplete}
        className="mt-4 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white print:hidden"
      >
        {t("markCaseCompleteButton")}
      </button>
    </div>
  );
}
