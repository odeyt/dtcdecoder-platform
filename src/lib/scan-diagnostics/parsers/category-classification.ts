// Classifies extracted DTC records into the five categories a diagnostic
// reasoning pass needs to reason about explicitly (pending / permanent /
// network / lost-communication / battery-related), without ever claiming a
// category was checked and found empty unless there's real evidence for
// that. See docs/DIAGNOSTIC_SCHEMA_V2.md.
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

const LOST_COMM_TEXT_PATTERN =
  /\b(lost communication|no communication|not communicating|no response|communication (fault|loss|error))\b/i;

// Battery/voltage classification relies only on text actually present
// (description or module status) — never a guessed P-code-range mapping,
// since low-voltage code ranges aren't standardized across manufacturers.
// Matches both phrasing orders real scan-tool text uses (SAE J2012's own
// P0562 description is literally "System Voltage Low").
const BATTERY_TEXT_PATTERN = /\b(battery|system voltage|voltage low|low voltage|charging system|voltage drop)\b/i;

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
