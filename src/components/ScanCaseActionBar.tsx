"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { UpgradeCard } from "@/components/UpgradeCard";
import type { ScanCaseStatus } from "@/lib/types";

const EXTRACT_STAGES = ["Parsing the scan report", "Extracting DTCs and vehicle info"];
const ANALYZE_STAGES = [
  "Sending your case to the AI",
  "Running diagnostic reasoning",
  "Running safety review",
  "Scoring confidence",
];

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
        // every other error shape here is a plain string. Extract .message
        // so this never renders a raw object as a React child.
        const message = typeof data.error === "string" ? data.error : (data.error?.message ?? "Something went wrong. Please try again.");
        setError(message);
        setRunning(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
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
            You already have {duplicateWarning.existingCases.length === 1 ? "a case" : "cases"} for VIN{" "}
            <span className="tech-value">{duplicateWarning.vin}</span>
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Running this analysis will use another report credit. You can view the existing report instead, or
            continue if this is a new, separate issue.
          </p>
        </div>
        <ul className="flex flex-col gap-2">
          {duplicateWarning.existingCases.map((c) => (
            <li key={c.id}>
              <a
                href={`/diagnostics/${c.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition hover:bg-white/5"
              >
                {c.complaint || "Diagnostic case"} — {c.status.replace(/_/g, " ")}
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
            Continue anyway
          </button>
          <button
            type="button"
            onClick={() => setDuplicateWarning(null)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-5 py-2.5 font-semibold text-[var(--text-secondary)] transition hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (status === "extracting" || status === "analyzing") {
    return (
      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-secondary)]">
        {status === "extracting" ? "Extraction is in progress…" : "AI analysis is in progress…"} Reload this page in
        a moment if this was started from another tab.
      </div>
    );
  }

  const action =
    status === "uploaded"
      ? { label: "Run extraction", stage: "extract" as const }
      : status === "ready_for_analysis"
        ? { label: "Start AI diagnostic analysis", stage: "analyze" as const }
        : status === "failed"
          ? hasExtraction
            ? { label: "Retry AI analysis", stage: "analyze" as const }
            : { label: "Retry extraction", stage: "extract" as const }
          : null;

  if (!action) return null;

  if (action.stage === "analyze" && !canAnalyze) {
    return (
      <div className="flex flex-col gap-3">
        {status === "failed" && errorMessage && <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>}
        <UpgradeCard reason="AI diagnostic analysis isn't included on the Free plan. Upgrade to Pro Technician or Workshop to analyze this case." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "failed" && errorMessage && <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>}
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
