// Deterministic diagnostic-priority ranking, computed BEFORE any AI
// narrative — never re-derived from what the AI says. Current-status,
// safety-relevant faults always outrank historical ones; reference-only
// generic codes never outrank a current fault. See
// docs/SCAN_PATTERN_AND_PRIORITY_ENGINE.md.
import type { CanonicalVehicleScan, CanonicalDtc } from "@/lib/scan-diagnostics/canonical-scan";
import type { DetectedPattern } from "@/lib/scan-diagnostics/patterns";

export interface DiagnosticPriority {
  fixFirst: CanonicalDtc[];
  diagnoseNext: CanonicalDtc[];
  monitorRecheck: CanonicalDtc[];
  historicalReference: CanonicalDtc[];
  drivingPatterns: DetectedPattern[];
}

export function computeDiagnosticPriority(
  scan: CanonicalVehicleScan,
  patterns: DetectedPattern[],
): DiagnosticPriority {
  const fixFirst: CanonicalDtc[] = [];
  const diagnoseNext: CanonicalDtc[] = [];
  const monitorRecheck: CanonicalDtc[] = [];
  const historicalReference: CanonicalDtc[] = [];

  for (const dtc of scan.allDtcs) {
    if (dtc.status === "current") {
      if (dtc.safetyRelevance || dtc.busOffRelevance) {
        fixFirst.push(dtc);
      } else {
        diagnoseNext.push(dtc);
      }
      continue;
    }
    if (dtc.status === "history") {
      monitorRecheck.push(dtc);
      continue;
    }
    // reference_only, unknown, pending, permanent, intermittent, stored,
    // and no-status-stated all land here — none of these outrank a current
    // fault, and reference-only codes are explicitly the lowest-priority,
    // least-actionable bucket per the report structure requirement.
    historicalReference.push(dtc);
  }

  // Critical/safety-severity patterns whose evidence includes a current
  // fault get surfaced alongside fixFirst as "driving patterns" context —
  // the fault list itself is unchanged; this is purely additional
  // narrative grouping for the report UI, not a re-classification of any
  // individual DTC.
  const drivingPatterns = patterns.filter((p) => p.severity === "critical");

  return { fixFirst, diagnoseNext, monitorRecheck, historicalReference, drivingPatterns };
}
