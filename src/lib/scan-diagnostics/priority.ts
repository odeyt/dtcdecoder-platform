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
    if (dtc.status === "current" || dtc.status === "permanent") {
      // A permanent DTC is a confirmed fault the ECU will not let itself
      // clear until the underlying condition is fixed and verified over a
      // full drive cycle — it is not a lesser or more historical class of
      // fault than "current," it is a currently-active, confirmed one.
      // Treating it as equivalent to "history"/"reference-only" would
      // silently demote a fault the vehicle itself is still actively
      // reporting. Safety/bus-off relevance still promotes to fixFirst
      // exactly as it does for a "current"-status fault.
      if (dtc.safetyRelevance || dtc.busOffRelevance) {
        fixFirst.push(dtc);
      } else {
        diagnoseNext.push(dtc);
      }
      continue;
    }
    if (dtc.status === "history" || dtc.status === "intermittent") {
      // An intermittent fault has occurred at least once but isn't
      // necessarily present right now — that's a recheck/monitor
      // situation, not an inert historical reference the way a generic
      // reference-only code is.
      monitorRecheck.push(dtc);
      continue;
    }
    // reference_only, unknown, pending, stored, and no-status-stated all
    // land here — none of these outrank a current/permanent fault, and
    // reference-only codes are explicitly the lowest-priority,
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
