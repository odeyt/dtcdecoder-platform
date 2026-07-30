"use client";

// Interactive Diagnostic Test Plan — recommendedTests come from the
// immutable, already-generated ScanReport (never re-derived or re-prompted
// here); only the technician's own progress against that fixed list is
// mutable, via scan_report_test_progress (migration 0042).
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ResultPill } from "@/components/ResultPill";
import { testOutcomeToPill } from "@/lib/scan-diagnostics/pill-mapping";
import { updateTestProgress } from "@/lib/scan-diagnostics/workbench-client";
import { useWorkbenchSaveStatus, withSaveStatus } from "@/components/scan-report/WorkbenchSaveStatus";
import type { ScanReportTestProgress, ScanTestOutcome } from "@/lib/types";

interface RecommendedTest {
  step: string;
  purpose: string;
  expectedResult: string;
}

interface TestPlanSectionProps {
  caseId: string;
  tests: RecommendedTest[];
  initialProgress: ScanReportTestProgress[];
}

function progressFor(list: ScanReportTestProgress[], testIndex: number): ScanReportTestProgress | undefined {
  return list.find((p) => p.test_index === testIndex);
}

export function TestPlanSection({ caseId, tests, initialProgress }: TestPlanSectionProps) {
  const [progress, setProgress] = useState(initialProgress);
  const { report, reportSaving } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  async function handleOutcomeChange(testIndex: number, outcome: ScanTestOutcome) {
    const updated = await withSaveStatus(report, reportSaving, () =>
      updateTestProgress(caseId, testIndex, { outcome, completed: outcome !== "not_tested" }),
    );
    if (updated) {
      setProgress((prev) => [...prev.filter((p) => p.test_index !== testIndex), updated]);
    }
  }

  if (tests.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{t("noneRecommended")}</p>;
  }

  const outcomeLabel: Record<ScanTestOutcome, string> = {
    not_tested: t("notTested"),
    pass: t("pass"),
    fail: t("fail"),
  };

  return (
    <ol className="flex flex-col gap-3">
      {tests.map((test, i) => {
        const p = progressFor(progress, i);
        const outcome: ScanTestOutcome = p?.outcome ?? "not_tested";
        return (
          <li key={i} className="glass-panel rounded-[var(--radius-lg)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {i + 1}. {test.step}
              </p>
              <ResultPill category="status" value={testOutcomeToPill(outcome)} />
            </div>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("purpose")} {test.purpose}
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t("expectedResult")} {test.expectedResult}
            </p>
            <div
              className="mt-3 flex flex-wrap gap-2 print:hidden"
              role="group"
              aria-label={t("outcomeGroupLabel", { n: i + 1 })}
            >
              {(["not_tested", "pass", "fail"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={outcome === value}
                  onClick={() => handleOutcomeChange(i, value)}
                  className="min-h-9 rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition"
                  style={{
                    borderColor: outcome === value ? "var(--accent-red)" : "var(--border-subtle)",
                    color: outcome === value ? "var(--accent-red)" : "var(--text-secondary)",
                  }}
                >
                  {outcomeLabel[value]}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
