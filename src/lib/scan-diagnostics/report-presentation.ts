// Pure, framework-free presentation helpers extracted out of
// ScanReportView.tsx so the legacy-compatibility logic (schema_version
// "1.0" rows have neither confidence_level nor per-cause confidenceLevel)
// can be unit-tested without a React rendering harness. See
// docs/DIAGNOSTIC_SCHEMA_V2.md.
import type { ScanReport } from "@/lib/types";

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  insufficient_evidence: "Insufficient evidence",
};

// A report is "legacy" if it predates categorical confidence entirely
// (schema_version "1.0") or — defensively — if confidence_level is null
// for any other reason. Either way, the only safe thing to show is "Not
// established," never a re-derived guess from the deprecated numeric field.
export function isLegacyReport(report: Pick<ScanReport, "schema_version" | "confidence_level">): boolean {
  return report.schema_version === "1.0" || !report.confidence_level;
}

// Resolves a possibly-undefined/possibly-unrecognized confidence level
// (e.g. a legacy ranked-cause object that only ever had probabilityPercent)
// into a display label — "Not established" rather than throwing or
// rendering "undefined"/a stale number.
export function resolveConfidenceLabel(level: string | null | undefined): string {
  if (!level || !CONFIDENCE_LABEL[level]) return "Not established";
  return CONFIDENCE_LABEL[level];
}
