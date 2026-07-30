"use client";

// Likely Causes — rankedCauses/confidence/evidence come from the immutable
// ScanReport (unchanged from today's AI output); only the technician's own
// review status (untested/supported/ruled_out/confirmed) is mutable, via
// scan_report_cause_status (migration 0042). Rank ("TOP CANDIDATE") is a
// position in the AI's own ordering, never re-derived from the review
// status below — confirming/ruling out a cause never reorders the list.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ResultPill } from "@/components/ResultPill";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { causeStatusToPill } from "@/lib/scan-diagnostics/pill-mapping";
import { updateCauseStatus } from "@/lib/scan-diagnostics/workbench-client";
import { useWorkbenchSaveStatus, withSaveStatus } from "@/components/scan-report/WorkbenchSaveStatus";
import type { ScanCauseStatus, ScanReportCauseStatus } from "@/lib/types";

interface RankedCause {
  cause: string;
  confidenceLevel?: "high" | "medium" | "low" | "insufficient_evidence";
  rationale: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  confirmationTestsRequired?: string[];
}

interface LikelyCausesSectionProps {
  caseId: string;
  causes: RankedCause[];
  initialStatus: ScanReportCauseStatus[];
}

const STATUS_OPTIONS: ScanCauseStatus[] = ["untested", "supported", "ruled_out", "confirmed"];

function statusFor(list: ScanReportCauseStatus[], causeIndex: number): ScanReportCauseStatus | undefined {
  return list.find((s) => s.cause_index === causeIndex);
}

const CONFIDENCE_KEY: Record<string, string> = {
  high: "confidenceHigh",
  medium: "confidenceMedium",
  low: "confidenceLow",
  insufficient_evidence: "confidenceInsufficientEvidence",
};

export function LikelyCausesSection({ caseId, causes, initialStatus }: LikelyCausesSectionProps) {
  const [statusList, setStatusList] = useState(initialStatus);
  const { report, reportSaving } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  const statusButtonLabel: Record<ScanCauseStatus, string> = {
    untested: t("statusUntested"),
    supported: t("statusSupported"),
    ruled_out: t("statusRuledOut"),
    confirmed: t("statusConfirmed"),
  };

  async function handleStatusChange(causeIndex: number, status: ScanCauseStatus) {
    const updated = await withSaveStatus(report, reportSaving, () => updateCauseStatus(caseId, causeIndex, { status }));
    if (updated) {
      setStatusList((prev) => [...prev.filter((s) => s.cause_index !== causeIndex), updated]);
    }
  }

  async function handleReviewedToggle(causeIndex: number, reviewed: boolean) {
    const updated = await withSaveStatus(report, reportSaving, () =>
      updateCauseStatus(caseId, causeIndex, { reviewed }),
    );
    if (updated) {
      setStatusList((prev) => [...prev.filter((s) => s.cause_index !== causeIndex), updated]);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {causes.map((cause, i) => {
        const s = statusFor(statusList, i);
        const status: ScanCauseStatus = s?.status ?? "untested";
        return (
          <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                style={{
                  borderColor: i === 0 ? "var(--accent-red)" : "var(--border-subtle)",
                  color: i === 0 ? "var(--accent-red)" : "var(--text-muted)",
                }}
              >
                {i === 0 ? t("topCandidate") : t("candidateN", { n: i + 1 })}
              </span>
              <ConfidenceBadge
                level={cause.confidenceLevel}
                label={cause.confidenceLevel && CONFIDENCE_KEY[cause.confidenceLevel] ? t(CONFIDENCE_KEY[cause.confidenceLevel]) : undefined}
              />
              <ResultPill category="status" value={causeStatusToPill(status)} />
            </div>
            <p className="mt-2 font-semibold text-[var(--text-primary)]">{cause.cause}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{cause.rationale}</p>
            {cause.supportingEvidence.length > 0 && (
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{t("supportingEvidence")} </span>
                {cause.supportingEvidence.join("; ")}
              </div>
            )}
            {cause.contradictingEvidence.length > 0 && (
              <div className="mt-1 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{t("contradictingEvidence")} </span>
                {cause.contradictingEvidence.join("; ")}
              </div>
            )}
            <div className="mt-2 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t("requiredBeforeReplacing")} </span>
              {cause.confirmationTestsRequired && cause.confirmationTestsRequired.length > 0
                ? cause.confirmationTestsRequired.join("; ")
                : t("notEstablishedLegacyCause")}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3 print:hidden">
              <span className="text-xs text-[var(--text-muted)]">{t("markThisCause")}</span>
              <div role="group" aria-label={t("statusForCause", { n: i + 1 })} className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={status === value}
                    onClick={() => handleStatusChange(i, value)}
                    className="min-h-9 rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition"
                    style={{
                      borderColor: status === value ? "var(--accent-red)" : "var(--border-subtle)",
                      color: status === value ? "var(--accent-red)" : "var(--text-secondary)",
                    }}
                  >
                    {statusButtonLabel[value]}
                  </button>
                ))}
              </div>
              <label className="ml-auto flex min-h-11 items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={s?.reviewed ?? false}
                  onChange={(e) => handleReviewedToggle(i, e.target.checked)}
                  className="h-4 w-4"
                />
                {t("reviewed")}
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
