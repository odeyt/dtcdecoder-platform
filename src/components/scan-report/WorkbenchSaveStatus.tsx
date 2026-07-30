"use client";

// Shared save-status broadcast for every interactive Workbench section
// (Test Plan, Likely Causes, Notes, Verification Checklist). Each section
// reports its own mutation outcome here so the Case Header can show one
// aggregate, honest status instead of five independent silent spinners.
// This never claims "saved" before the server actually confirms it — see
// report() below, which is only ever called from a resolved/rejected fetch.
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { recordClientEvent } from "@/lib/analytics/client";

export type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: number }
  | { status: "error"; message: string };

interface WorkbenchSaveStatusValue {
  state: SaveState;
  report: (result: { ok: true } | { ok: false; message: string }) => void;
  reportSaving: () => void;
}

const WorkbenchSaveStatusContext = createContext<WorkbenchSaveStatusValue | null>(null);

export function WorkbenchSaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SaveState>({ status: "idle" });

  const reportSaving = useCallback(() => setState({ status: "saving" }), []);
  const report = useCallback((result: { ok: true } | { ok: false; message: string }) => {
    setState(result.ok ? { status: "saved", at: Date.now() } : { status: "error", message: result.message });
    // Generic "a save happened" signal, distinct from the specific
    // diagnostic_report_test_checked / _cause_status_changed / etc. events
    // already fired server-side per field — never includes the error
    // message text (that's a Clipboard/fetch failure string, not
    // structured metadata) or any note/measurement content.
    recordClientEvent(result.ok ? "diagnostic_report_progress_saved" : "diagnostic_report_save_failed");
  }, []);

  const value = useMemo(() => ({ state, report, reportSaving }), [state, report, reportSaving]);

  return <WorkbenchSaveStatusContext.Provider value={value}>{children}</WorkbenchSaveStatusContext.Provider>;
}

export function useWorkbenchSaveStatus(): WorkbenchSaveStatusValue {
  const ctx = useContext(WorkbenchSaveStatusContext);
  if (!ctx) throw new Error("useWorkbenchSaveStatus must be used within a WorkbenchSaveStatusProvider");
  return ctx;
}

// Runs an async mutation, reporting saving/saved/error into the shared
// status so every section's checkbox/toggle honestly reflects real server
// confirmation rather than an optimistic assumption.
export async function withSaveStatus<T>(
  report: WorkbenchSaveStatusValue["report"],
  reportSaving: WorkbenchSaveStatusValue["reportSaving"],
  fn: () => Promise<T>,
): Promise<T | null> {
  reportSaving();
  try {
    const result = await fn();
    report({ ok: true });
    return result;
  } catch (err) {
    report({ ok: false, message: err instanceof Error ? err.message : "Save failed." });
    return null;
  }
}

function formatSavedAt(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function SaveStatusIndicator() {
  const { state } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  if (state.status === "idle") return null;

  return (
    <div aria-live="polite" className="text-xs">
      {state.status === "saving" && <span className="text-[var(--text-muted)]">{t("saving")}</span>}
      {state.status === "saved" && (
        <span className="text-[var(--text-muted)]">{t("savedAt", { time: formatSavedAt(state.at) })}</span>
      )}
      {state.status === "error" && (
        <span role="alert" className="font-semibold" style={{ color: "var(--accent-red)" }}>
          {t("saveFailed", { message: state.message })}
        </span>
      )}
    </div>
  );
}
