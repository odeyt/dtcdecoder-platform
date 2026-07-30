"use client";

// Fires a single diagnostic_report_viewed beacon on mount. A tiny client
// component (not inline in the server-rendered ScanReportView) since
// firing an analytics event is a client-only side effect — this renders
// nothing.
import { useEffect } from "react";
import { recordClientEvent } from "@/lib/analytics/client";
import type { AiDiagnosticAccessLevel } from "@/lib/ai-diagnostics/entitlements";

export function ReportViewedTracker({ accessLevel }: { accessLevel: AiDiagnosticAccessLevel }) {
  useEffect(() => {
    recordClientEvent("diagnostic_report_viewed", { accessLevel });
    // Only ever fire once per mount — accessLevel doesn't change without a
    // full page navigation (a fresh case/report), which remounts anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
