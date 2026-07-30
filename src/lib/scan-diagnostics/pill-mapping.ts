import type { ScanCauseStatus, ScanTestOutcome } from "@/lib/types";
import type { DiagnosticStatusValue } from "@/components/ResultPill";

// Migration 0039 persists its own enum spelling (chosen independently of the
// Workbench pill-color spec) — these adapters translate that storage-layer
// spelling to ResultPill's canonical DiagnosticStatusValue labels without
// changing what either side means. Same concept, same subject, just terser
// column values than the pill vocabulary's label-friendly ones.
export function causeStatusToPill(status: ScanCauseStatus): DiagnosticStatusValue {
  switch (status) {
    case "untested":
      return "not_tested";
    case "supported":
      return "supported";
    case "ruled_out":
      return "ruled_out";
    case "confirmed":
      return "confirmed";
  }
}

export function testOutcomeToPill(outcome: ScanTestOutcome): DiagnosticStatusValue {
  switch (outcome) {
    case "pass":
      return "passed_test";
    case "fail":
      return "failed_test";
    case "not_tested":
      return "not_tested";
  }
}
