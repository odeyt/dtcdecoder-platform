// Classifies extracted DTC records into the categories a diagnostic
// reasoning pass needs to reason about explicitly (pending / permanent /
// network / lost-communication / battery-related / bus-off), without ever
// claiming a category was checked and found empty unless there's real
// evidence for that. See docs/DIAGNOSTIC_SCHEMA_V2.md and
// docs/FULL_SCAN_DATA_LOSS_AUDIT.md findings #13/#15.
//
// Deliberately conservative: only ever returns "found" (real evidence
// exists) or "not_stated" (no evidence either way). "none_reported" is a
// valid value in the schema for a future parser that adds real detection
// of an explicit "no pending codes" statement in report text, but nothing
// here attempts that today — claiming "none_reported" without textual
// proof would be exactly the kind of unsupported inference this feature
// exists to prevent.
import type { ScanDtcRecord, ScanModule } from "@/lib/types";
import type { DtcCategory, DtcCategoryClassification } from "@/lib/scan-diagnostics/schemas";

// U-codes are the standardized OBD-II network/communication category —
// this is documented industry convention, not an invented mapping.
const NETWORK_CODE_PATTERN = /^U/i;

// Widened from just "lost communication"/"no communication" (finding #13 —
// that narrower list missed the actual phrasings a real multi-module scan
// export uses: "Frame Lost", "Node Missing", "Message Lost", "Interrupted",
// "Cannot Receive", "Signal Missing", "Timeout"). Every phrase here was
// picked because it appears verbatim in real scan-tool DTC descriptions,
// not invented.
const LOST_COMM_TEXT_PATTERN =
  /\b(lost communication|no communication|not communicating|no response|communication\s*(fault|loss|error|interrupted)|frame lost|node (missing|lost)|message (lost|timeout)|cannot receive|signal missing|(?:can|network|message|node)\s*(?:message\s*)?timeout|interrupted)\b/i;

// Battery/voltage classification relies only on text actually present
// (description or module status) — never a guessed P-code-range mapping,
// since low-voltage code ranges aren't standardized across manufacturers.
// Matches both phrasing orders real scan-tool text uses (SAE J2012's own
// P0562 description is literally "System Voltage Low").
const BATTERY_TEXT_PATTERN = /\b(battery|system voltage|voltage low|low voltage|charging system|voltage drop|undervoltage|overvoltage|supply voltage)\b/i;

// New category (finding #15) — "CAN Bus Off"/"Busoff" had nowhere to be
// classified into before.
const BUS_OFF_TEXT_PATTERN = /\bcan\s*bus[\s-]*off\b/i;

const SAFETY_SYSTEM_PATTERN = /\b(srs|airbag|abs|anti-?lock brake|steering|brake|restraint)\b/i;

function classify(matched: ScanDtcRecord[]): DtcCategory {
  if (matched.length > 0) {
    return { status: "found", codes: matched.map((r) => r.code) };
  }
  return { status: "not_stated", codes: [] };
}

export function classifyDtcCategories(
  records: ScanDtcRecord[],
  modules: Pick<ScanModule, "name" | "status">[] = [],
): DtcCategoryClassification {
  const pending = classify(records.filter((r) => r.status === "pending"));
  const permanent = classify(records.filter((r) => r.status === "permanent"));
  const network = classify(records.filter((r) => NETWORK_CODE_PATTERN.test(r.code)));

  const moduleReportsLostComm = modules.some((m) => LOST_COMM_TEXT_PATTERN.test(m.status ?? ""));
  const lostCommunication = classify(
    records.filter(
      (r) => NETWORK_CODE_PATTERN.test(r.code) && LOST_COMM_TEXT_PATTERN.test(r.description_raw ?? ""),
    ),
  );
  if (lostCommunication.status === "not_stated" && moduleReportsLostComm) {
    // A module explicitly reported as non-communicating is real evidence
    // even without a specific U-code attached to it.
    lostCommunication.status = "found";
  }

  const batteryRelated = classify(records.filter((r) => BATTERY_TEXT_PATTERN.test(r.description_raw ?? "")));

  return {
    pendingCodes: pending,
    permanentCodes: permanent,
    networkFaults: network,
    lostCommunicationFaults: lostCommunication,
    batteryRelatedFaults: batteryRelated,
  };
}

// Bus-off is intentionally kept out of DtcCategoryClassificationSchema (the
// AI-facing schema — changing it would be a wider, riskier surface change
// than this fix needs) and instead surfaced as a plain derived list used by
// the pattern engine and report UI directly.
export function findBusOffCodes(records: ScanDtcRecord[]): string[] {
  return records.filter((r) => BUS_OFF_TEXT_PATTERN.test(r.description_raw ?? "")).map((r) => r.code);
}

// Per-DTC relevance flags computed once at extraction time (persisted on
// scan_dtc_records — migration 0028) so the report UI and admin inspection
// screen can show "why is this counted as X" without re-deriving it from
// description text on every read.
export interface DtcRelevanceFlags {
  safetyRelevance: boolean;
  networkRelevance: boolean;
  batteryRelevance: boolean;
  busOffRelevance: boolean;
}

export function classifyDtcRelevance(code: string, descriptionRaw: string | null | undefined): DtcRelevanceFlags {
  const description = descriptionRaw ?? "";
  return {
    networkRelevance: NETWORK_CODE_PATTERN.test(code) || LOST_COMM_TEXT_PATTERN.test(description),
    batteryRelevance: BATTERY_TEXT_PATTERN.test(description),
    busOffRelevance: BUS_OFF_TEXT_PATTERN.test(description),
    // A DTC's own code/description rarely names "SRS"/"ABS" directly (that's
    // usually the SYSTEM heading, not the code text) — callers with a
    // system name available should prefer classifySystemSafetyRelevance
    // below; this is the best-effort fallback when only the code/
    // description is known.
    safetyRelevance: SAFETY_SYSTEM_PATTERN.test(description),
  };
}

export function isSafetyCriticalSystem(systemName: string | null | undefined): boolean {
  return SAFETY_SYSTEM_PATTERN.test(systemName ?? "");
}
