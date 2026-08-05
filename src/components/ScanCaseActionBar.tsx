"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { UpgradeCard } from "@/components/UpgradeCard";
import { formatLimitErrorMessage } from "@/lib/i18n/limit-error-messages";
import type { ScanCaseStatus } from "@/lib/types";

interface ExistingVinCase {
  id: string;
  status: string;
  complaint: string | null;
  createdAt: string;
}

interface ScanCaseActionBarProps {
  caseId: string;
  status: ScanCaseStatus;
  hasExtraction: boolean;
  errorMessage?: string | null;
  // Whether the viewer's current plan can run AI diagnostic analysis at
  // all (Free never can — see AI_DIAGNOSTIC_ENTITLEMENTS in
  // src/lib/pricing.ts). Extraction stays available regardless: it's
  // deterministic parsing, not an AI diagnostic call.
  canAnalyze: boolean;
}

// Real, honest actions only — one button per case status, reflecting what
// this exact request actually does (see the endpoint each button calls).
export function ScanCaseActionBar({ caseId, status, hasExtraction, errorMessage, canAnalyze }: ScanCaseActionBarProps) {
  const router = useRouter();
  const t = useTranslations("scanCaseActionBar");
  const tStages = useTranslations("diagnosticStages");
  const tVin = useTranslations("scanDuplicateVin");
  const tCommon = useTranslations("common");
  const tApiErrors = useTranslations("apiErrors");
  const tLimit = useTranslations("usageLimitErrors");
  // scan_cases.error_message stores a stable code (e.g. "EXTRACTION_FAILED")
  // for any row written after this mapping was introduced — translated here
  // at render time so the same stored row reads correctly in every locale.
  // Falls back to the raw stored value for rows written before this change,
  // which still hold literal (English) text.
  const PERSISTED_ERROR_LABEL: Record<string, string> = {
    NO_UPLOADED_FILE: tApiErrors("noUploadedFile"),
    EXTRACTION_FAILED: tApiErrors("extractionFailedRetry"),
    AI_ANALYSIS_FAILED: tApiErrors("analysisFailedRetry"),
    AI_BUDGET_PAUSED: tApiErrors("aiAnalysisPaused"),
  };
  const displayErrorMessage = errorMessage ? (PERSISTED_ERROR_LABEL[errorMessage] ?? errorMessage) : null;
  const EXTRACT_STAGES = [tStages("parsingScanReport"), tStages("extractingDtcs")];
  const ANALYZE_STAGES = [
    tStages("sendingToAi"),
    tStages("runningDiagnosticReasoning"),
    tStages("runningSafetyReview"),
    tStages("scoringConfidence"),
  ];
  const [running, setRunning] = useState<"extract" | "analyze" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ vin: string; existingCases: ExistingVinCase[] } | null>(
    null,
  );

  async function runStage(stage: "extract" | "analyze", confirmDuplicateVin = false) {
    setRunning(stage);
    setError(null);
    if (confirmDuplicateVin) setDuplicateWarning(null);
    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/${stage}`, {
        method: "POST",
        ...(stage === "analyze"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmDuplicateVin }) }
          : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (stage === "analyze" && res.status === 409 && data.code === "DUPLICATE_VIN") {
          setDuplicateWarning({ vin: data.vin, existingCases: data.existingCases ?? [] });
          setRunning(null);
          return;
        }
        // A 429 quota-exceeded response (AiDiagnosticLimitExceededError, see
        // toSafeErrorResponse) shapes `error` as an object, not a string —
        // every other error shape here is a plain string.
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? formatLimitErrorMessage(data.error, tLimit) || t("errorGeneric")
              : t("errorGeneric");
        setError(message);
        setRunning(null);
        return;
      }
      router.refresh();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setRunning(null);
    }
  }

  if (running === "extract") {
    return <DiagnosticProgress stages={EXTRACT_STAGES} />;
  }
  if (running === "analyze") {
    return <DiagnosticProgress stages={ANALYZE_STAGES} />;
  }

  if (duplicateWarning) {
    return (
      <div className="glass-panel flex flex-col gap-4 rounded-[var(--radius-lg)] p-5">
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            {duplicateWarning.existingCases.length === 1 ? tVin("headingOne") : tVin("headingMany")}{" "}
            <span className="tech-value">{duplicateWarning.vin}</span>
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{tVin("body")}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {duplicateWarning.existingCases.map((c) => (
            <li key={c.id}>
              <a
                href={`/diagnostics/${c.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition hover:bg-white/5"
              >
                {c.complaint || tVin("diagnosticCaseFallback")} — {c.status.replace(/_/g, " ")}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runStage("analyze", true)}
            className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2.5 font-semibold text-white transition hover:brightness-110"
          >
            {tVin("continueAnyway")}
          </button>
          <button
            type="button"
            onClick={() => setDuplicateWarning(null)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-5 py-2.5 font-semibold text-[var(--text-secondary)] transition hover:bg-white/5"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (status === "extracting" || status === "analyzing") {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-secondary)]">
        {status === "extracting" ? t("extractionInProgress") : t("analysisInProgress")} {t("reloadNote")}
      </div>
    );
  }

  const action =
    status === "uploaded"
      ? { label: t("runExtraction"), stage: "extract" as const }
      : status === "ready_for_analysis"
        ? { label: t("startAnalysis"), stage: "analyze" as const }
        : status === "failed"
          ? hasExtraction
            ? { label: t("retryAnalysis"), stage: "analyze" as const }
            : { label: t("retryExtraction"), stage: "extract" as const }
          : null;

  if (!action) return null;

  if (action.stage === "analyze" && !canAnalyze) {
    return (
      <div className="flex flex-col gap-3">
        {status === "failed" && displayErrorMessage && <p className="text-sm text-[var(--accent-red)]">{displayErrorMessage}</p>}
        <UpgradeCard reason={t("upgradeReason")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "failed" && displayErrorMessage && <p className="text-sm text-[var(--accent-red)]">{displayErrorMessage}</p>}
      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}
      <button
        onClick={() => runStage(action.stage)}
        className="min-h-11 w-fit rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
      >
        {action.label}
      </button>
    </div>
  );
}
