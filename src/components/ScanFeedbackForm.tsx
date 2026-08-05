"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ScanFeedback } from "@/lib/types";

interface ScanFeedbackFormProps {
  caseId: string;
  existingFeedback: ScanFeedback | null;
}

export function ScanFeedbackForm({ caseId, existingFeedback }: ScanFeedbackFormProps) {
  const t = useTranslations("scanFeedback");
  const [diagnosisWasCorrect, setDiagnosisWasCorrect] = useState<boolean | undefined>(
    existingFeedback?.diagnosis_was_correct ?? undefined,
  );
  const [actualRootCause, setActualRootCause] = useState(existingFeedback?.actual_root_cause ?? "");
  const [confirmedFix, setConfirmedFix] = useState(existingFeedback?.confirmed_fix ?? "");
  const [partsReplaced, setPartsReplaced] = useState((existingFeedback?.parts_replaced ?? []).join(", "));
  const [notes, setNotes] = useState(existingFeedback?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "submitting" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosisWasCorrect,
          actualRootCause: actualRootCause || undefined,
          confirmedFix: confirmedFix || undefined,
          partsReplaced: partsReplaced
            ? partsReplaced.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("errorSaveFailed"));
        setStatus("idle");
        return;
      }
      setStatus("saved");
    } catch {
      setError(t("errorGeneric"));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel flex flex-col gap-4 rounded-[var(--radius-lg)] p-5">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{t("wasCorrectQuestion")}</p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => setDiagnosisWasCorrect(true)}
            className="min-h-11 rounded-[var(--radius-md)] border px-4 py-2 text-sm transition"
            style={{
              borderColor: diagnosisWasCorrect === true ? "var(--accent-red)" : "var(--border-subtle)",
              color: diagnosisWasCorrect === true ? "var(--accent-red)" : "var(--text-secondary)",
            }}
          >
            {t("yes")}
          </button>
          <button
            type="button"
            onClick={() => setDiagnosisWasCorrect(false)}
            className="min-h-11 rounded-[var(--radius-md)] border px-4 py-2 text-sm transition"
            style={{
              borderColor: diagnosisWasCorrect === false ? "var(--accent-red)" : "var(--border-subtle)",
              color: diagnosisWasCorrect === false ? "var(--accent-red)" : "var(--text-secondary)",
            }}
          >
            {t("no")}
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        {t("fieldActualRootCause")}
        <input
          value={actualRootCause}
          onChange={(e) => setActualRootCause(e.target.value)}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        {t("fieldConfirmedFix")}
        <input
          value={confirmedFix}
          onChange={(e) => setConfirmedFix(e.target.value)}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        {t("fieldPartsReplaced")}
        <input
          value={partsReplaced}
          onChange={(e) => setPartsReplaced(e.target.value)}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
        {t("fieldNotes")}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
        />
      </label>

      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}
      {status === "saved" && <p className="text-sm text-[var(--text-secondary)]">{t("feedbackSaved")}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="min-h-11 w-fit rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "submitting" ? t("saving") : existingFeedback ? t("updateFeedback") : t("submitFeedback")}
      </button>
    </form>
  );
}
