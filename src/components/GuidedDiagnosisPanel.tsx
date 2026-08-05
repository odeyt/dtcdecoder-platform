"use client";

// Phase 2.1 Step 5 — consultation-shell integration for the Diagnostic
// Engine (docs/PHASE_2_1_RELEASE_PLAN.md). Renders the STRUCTURED turn
// response the API already produces (never a raw AI paragraph) and drives
// the one-question-at-a-time loop:
//
//   case selected/created -> POST /turn -> structured render
//   -> user answers ONE next question -> POST /answers -> POST /turn again
//
// This component never talks to an AI provider directly and never builds
// its own prompt — it only calls the existing, already-gated
// /api/diagnostic-engine/v1/* routes and renders whatever structured JSON
// they return. A 404/429/401 from those routes is rendered as an explicit
// locked/limit/sign-in state, never silently retried into a fabricated
// result.
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatLimitErrorMessage } from "@/lib/i18n/limit-error-messages";
import type { DiagnosticEngineTurnResult } from "@/lib/diagnostic-engine/orchestrator";

interface GuidedDiagnosisPanelProps {
  initialCaseId: string | null;
  onCaseCreated?: (caseId: string) => void;
}

type PanelStatus = "idle" | "loading" | "ready" | "locked" | "limit_reached" | "signed_out" | "error";

interface RepairVerificationItem {
  item: string;
  completed: boolean;
  notes?: string;
}

interface RepairVerificationState {
  checklist: RepairVerificationItem[];
  completedAt: string | null;
}

const CONFIDENCE_BADGE_CLASS: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-orange-400",
  insufficient_evidence: "text-[var(--text-muted)]",
};

const SAFETY_BADGE_CLASS: Record<string, string> = {
  safe_to_drive: "text-emerald-400",
  drive_with_caution: "text-amber-400",
  tow_recommended: "text-orange-400",
  immediate_stop: "text-[var(--accent-red)]",
};

export function GuidedDiagnosisPanel({ initialCaseId, onCaseCreated }: GuidedDiagnosisPanelProps) {
  const t = useTranslations("dtcTechnicianShell");
  const tLimit = useTranslations("usageLimitErrors");
  const [caseId, setCaseId] = useState<string | null>(initialCaseId);
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnResult, setTurnResult] = useState<DiagnosticEngineTurnResult | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checklist, setChecklist] = useState<RepairVerificationState | null>(null);

  async function ensureCaseId(): Promise<string | null> {
    if (caseId) return caseId;
    const res = await fetch("/api/scan-diagnostics/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const newCaseId: string | undefined = data?.case?.id;
    if (!newCaseId) return null;
    setCaseId(newCaseId);
    onCaseCreated?.(newCaseId);
    return newCaseId;
  }

  async function runTurn() {
    setStatus("loading");
    setErrorMessage(null);

    const id = await ensureCaseId();
    if (!id) {
      setStatus("error");
      setErrorMessage(t("errorGeneric"));
      return;
    }

    try {
      const res = await fetch(`/api/diagnostic-engine/v1/cases/${id}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID() }),
      });

      if (res.status === 401) {
        setStatus("signed_out");
        return;
      }
      if (res.status === 404) {
        setStatus("locked");
        setErrorMessage(t("guidedDiagnosisNotAvailable"));
        return;
      }
      if (res.status === 429) {
        const data = await res.json().catch(() => null);
        setStatus("limit_reached");
        setErrorMessage(
          data?.error ? formatLimitErrorMessage(data.error, tLimit) || t("guidedDiagnosisLimitReached") : t("guidedDiagnosisLimitReached"),
        );
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(t("guidedDiagnosisFailed"));
        return;
      }

      const data: DiagnosticEngineTurnResult = await res.json();
      setTurnResult(data);
      setStatus("ready");
    } catch {
      setStatus("error");
      setErrorMessage(t("guidedDiagnosisFailed"));
    }
  }

  async function submitAnswer(answerText: string, answerValue?: unknown) {
    const question = turnResult?.response?.nextQuestion;
    if (!caseId || !question || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/diagnostic-engine/v1/cases/${caseId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.id,
          fieldKey: question.fieldKey,
          answerText,
          answerValue: answerValue ?? answerText,
        }),
      });
      if (!res.ok) {
        setErrorMessage(t("guidedDiagnosisFailed"));
        return;
      }
      setAnswerInput("");
      await runTurn();
    } finally {
      setSubmitting(false);
    }
  }

  async function generateChecklist() {
    if (!caseId) return;
    const res = await fetch(`/api/diagnostic-engine/v1/cases/${caseId}/repair-verification`, { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    setChecklist(data.verification);
  }

  async function toggleChecklistItem(item: string, completed: boolean) {
    if (!caseId) return;
    const res = await fetch(`/api/diagnostic-engine/v1/cases/${caseId}/repair-verification`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item, completed }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setChecklist(data.verification);
  }

  const response = turnResult?.response ?? null;
  const question = response?.nextQuestion ?? null;

  return (
    <div className="mt-4 flex flex-1 flex-col overflow-y-auto" aria-live="polite">
      {status === "idle" && (
        <button
          type="button"
          onClick={runTurn}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          {t("guidedDiagnosis")}
        </button>
      )}

      {status === "loading" && <p className="text-sm text-[var(--text-muted)]">{t("guidedDiagnosisLoading")}</p>}

      {status === "signed_out" && <p role="alert" className="text-sm text-[var(--text-secondary)]">{t("guidedDiagnosisSignInRequired")}</p>}

      {(status === "locked" || status === "limit_reached") && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-[var(--text-secondary)]">{errorMessage}</p>
          <Link href="/pricing" className="inline-block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-red)] px-4 py-2 text-sm font-semibold text-[var(--accent-red)]">
            {t("guidedDiagnosisUpgradeCta")}
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
          <button
            type="button"
            onClick={runTurn}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)]"
          >
            {t("guidedDiagnosisRetry")}
          </button>
        </div>
      )}

      {status === "ready" && response && (
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisSummaryLabel")}</h3>
            <p className="text-[var(--text-secondary)]">{response.summary}</p>
          </section>

          {response.evidenceUsed.length > 0 && (
            <section>
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisEvidenceUsedLabel")}</h3>
              <ul className="list-disc pl-5 text-[var(--text-secondary)]">
                {response.evidenceUsed.map((e) => (
                  <li key={e.id}>{e.summary}</li>
                ))}
              </ul>
            </section>
          )}

          {response.probabilityRanking.length > 0 && (
            <section>
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisHypothesesLabel")}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-[var(--text-secondary)]">
                {response.probabilityRanking.map((h) => (
                  <li key={h.rank}>
                    <span className="font-medium text-[var(--text-primary)]">{h.hypothesis}</span>{" "}
                    <span className={CONFIDENCE_BADGE_CLASS[h.confidenceLevel] ?? ""}>({h.confidenceLevel})</span>
                    <p className="text-xs text-[var(--text-muted)]">{h.reasoning}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisConfidenceLabel")}</h3>
            <p className={CONFIDENCE_BADGE_CLASS[response.confidence.overallConfidenceLevel] ?? ""}>
              {response.confidence.overallConfidenceLevel}
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisMissingEvidenceLabel")}</h3>
            <p className="text-[var(--text-secondary)]">
              {response.confidence.evidenceMissing.length > 0
                ? response.confidence.evidenceMissing.join(", ")
                : t("guidedDiagnosisNoMissingEvidence")}
            </p>
          </section>

          {response.recommendedTests.length > 0 && (
            <section>
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisRecommendedTestsLabel")}</h3>
              <ul className="list-disc pl-5 text-[var(--text-secondary)]">
                {response.recommendedTests.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
          )}

          {turnResult?.safety && (
            <section>
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisSafetyLabel")}</h3>
              <p className={SAFETY_BADGE_CLASS[turnResult.safety.status] ?? ""}>{turnResult.safety.status}</p>
              <p className="text-xs text-[var(--text-muted)]">{turnResult.safety.reasoning}</p>

              {turnResult.safety.hvHazard && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="mt-2 space-y-1 rounded-[var(--radius-md)] border border-[var(--border-red)] bg-[var(--accent-red)]/10 p-3 text-xs"
                >
                  <p className="font-semibold text-[var(--accent-red)]">{t("guidedDiagnosisHazardLabel")}</p>
                  <p className="text-[var(--text-secondary)]">{turnResult.safety.hvHazard.hazardCategory.replace(/_/g, " ")}</p>
                  <p className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisImmediateActionLabel")}</p>
                  <p className="text-[var(--text-secondary)]">{turnResult.safety.hvHazard.immediateAction}</p>
                  <p className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisProhibitedLabel")}</p>
                  <ul className="list-disc pl-4 text-[var(--text-secondary)]">
                    {turnResult.safety.hvHazard.prohibitedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                  <p className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisRequiredQualificationLabel")}</p>
                  <p className="text-[var(--text-secondary)]">{turnResult.safety.hvHazard.requiredQualification}</p>
                  <p className="text-[var(--text-secondary)]">{turnResult.safety.hvHazard.ppeWarning}</p>
                  <p className="text-[var(--text-secondary)]">{turnResult.safety.hvHazard.manufacturerProcedureWarning}</p>
                </div>
              )}
            </section>
          )}

          {question && (
            <section className="border-t border-[var(--border-subtle)] pt-3">
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisNextQuestionLabel")}</h3>
              <p className="mb-2 text-[var(--text-secondary)]">{question.questionText}</p>

              {question.responseType === "yes_no" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitAnswer(t("guidedDiagnosisYes"), "yes")}
                    className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {t("guidedDiagnosisYes")}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitAnswer(t("guidedDiagnosisNo"), "no")}
                    className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-60"
                  >
                    {t("guidedDiagnosisNo")}
                  </button>
                </div>
              )}

              {question.responseType === "choice" && (
                <div className="flex flex-wrap gap-2">
                  {question.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      disabled={submitting}
                      onClick={() => submitAnswer(choice, choice)}
                      className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-60"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {question.responseType === "text" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (answerInput.trim()) submitAnswer(answerInput.trim());
                  }}
                  className="flex gap-2"
                >
                  <label htmlFor="guided-diagnosis-answer" className="sr-only">
                    {question.questionText}
                  </label>
                  <input
                    id="guided-diagnosis-answer"
                    type="text"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder={t("guidedDiagnosisAnswerPlaceholder")}
                    disabled={submitting}
                    className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !answerInput.trim()}
                    className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {t("guidedDiagnosisSubmitAnswer")}
                  </button>
                </form>
              )}
            </section>
          )}

          {response.confidence.overallConfidenceLevel === "high" && (
            <section className="border-t border-[var(--border-subtle)] pt-3">
              <h3 className="font-semibold text-[var(--text-primary)]">{t("guidedDiagnosisRepairChecklistLabel")}</h3>
              {!checklist ? (
                <button
                  type="button"
                  onClick={generateChecklist}
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                >
                  {t("guidedDiagnosisGenerateChecklist")}
                </button>
              ) : (
                <ul className="space-y-1">
                  {checklist.checklist.map((row) => (
                    <li key={row.item} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`checklist-${row.item}`}
                        checked={row.completed}
                        onChange={(e) => toggleChecklistItem(row.item, e.target.checked)}
                        className="h-4 w-4"
                      />
                      <label htmlFor={`checklist-${row.item}`} className="text-[var(--text-secondary)]">
                        {row.item}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
