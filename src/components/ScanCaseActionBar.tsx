"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import type { ScanCaseStatus } from "@/lib/types";

const EXTRACT_STAGES = ["Parsing the scan report", "Extracting DTCs and vehicle info"];
const ANALYZE_STAGES = [
  "Sending your case to the AI",
  "Running diagnostic reasoning",
  "Running safety review",
  "Scoring confidence",
];

interface ScanCaseActionBarProps {
  caseId: string;
  status: ScanCaseStatus;
  hasExtraction: boolean;
  errorMessage?: string | null;
}

// Real, honest actions only — one button per case status, reflecting what
// this exact request actually does (see the endpoint each button calls).
export function ScanCaseActionBar({ caseId, status, hasExtraction, errorMessage }: ScanCaseActionBarProps) {
  const router = useRouter();
  const [running, setRunning] = useState<"extract" | "analyze" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runStage(stage: "extract" | "analyze") {
    setRunning(stage);
    setError(null);
    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/${stage}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
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
