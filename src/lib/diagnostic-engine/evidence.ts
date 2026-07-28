// Evidence Engine (docs/EVIDENCE_ENGINE.md) — the first stage of the
// Phase 2 pipeline (User -> Diagnostic Intake -> Evidence Engine -> ...).
// Every fact the engine reasons over becomes a structured, persisted
// EvidenceItem — never a raw string folded into a prompt. Reuses the
// EXISTING canonical-scan projection (buildCanonicalVehicleScan) rather
// than re-deriving vehicle/DTC facts a second way.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScanCase, ScanExtraction } from "@/lib/types";
import type { CanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import type { EvidenceItem, EvidenceType, EvidenceConfidence, NewEvidenceItem } from "@/lib/diagnostic-engine/types";
import { detectHvHazardCategory } from "@/lib/diagnostic-engine/hv-hazard-keywords";

interface EvidenceRow {
  id: string;
  case_id: string;
  evidence_type: EvidenceType;
  value: unknown;
  source: EvidenceItem["source"];
  confidence: EvidenceConfidence;
  recorded_at: string;
}

function fromRow(row: EvidenceRow): EvidenceItem {
  return {
    id: row.id,
    caseId: row.case_id,
    type: row.evidence_type,
    value: row.value,
    source: row.source,
    confidence: row.confidence,
    recordedAt: row.recorded_at,
  };
}

export async function insertEvidence(caseId: string, items: NewEvidenceItem[]): Promise<EvidenceItem[]> {
  if (items.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("diagnostic_evidence")
    .insert(
      items.map((item) => ({
        case_id: caseId,
        evidence_type: item.type,
        value: item.value,
        source: item.source,
        confidence: item.confidence,
        recorded_at: item.recordedAt ?? new Date().toISOString(),
      })),
    )
    .select("*");
  if (error) throw error;
  return (data as EvidenceRow[]).map(fromRow);
}

export async function getEvidenceForCase(caseId: string): Promise<EvidenceItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("diagnostic_evidence")
    .select("*")
    .eq("case_id", caseId)
    .order("recorded_at", { ascending: true });
  if (error) throw error;
  return (data as EvidenceRow[]).map(fromRow);
}

// Evidence already present for a given (type, value) pair for this case —
// used to avoid re-recording the same fact twice across repeated engine
// runs (see docs/PHASE_2_ARCHITECTURE.md "cost optimization: only send
// changed evidence").
export function dedupeAgainstExisting(existing: EvidenceItem[], candidates: NewEvidenceItem[]): NewEvidenceItem[] {
  const existingKeys = new Set(existing.map((e) => `${e.type}:${JSON.stringify(e.value)}`));
  return candidates.filter((c) => !existingKeys.has(`${c.type}:${JSON.stringify(c.value)}`));
}

// Deterministic evidence extraction from a case's own persisted state —
// works for a case regardless of whether it started from a scan upload,
// quick DTC entry, or a landing intake, since all three write to the same
// scan_cases/scan_extractions/scan_dtc_records rows (see
// docs/PHASE_1_DTC_TECHNICIAN_AUDIT.md's "case memory" finding).
export function buildEvidenceFromCase(
  scanCase: ScanCase,
  extraction: ScanExtraction | null,
  canonicalScan: CanonicalVehicleScan,
): NewEvidenceItem[] {
  const items: NewEvidenceItem[] = [];
  const source = extraction ? "extraction" : "user_reported";

  if (canonicalScan.vehicle.vin) {
    items.push({ type: "vin", value: canonicalScan.vehicle.vin, source, confidence: "high" });
  }
  if (canonicalScan.vehicle.year || canonicalScan.vehicle.make || canonicalScan.vehicle.model) {
    items.push({
      type: "vehicle",
      value: { year: canonicalScan.vehicle.year, make: canonicalScan.vehicle.make, model: canonicalScan.vehicle.model },
      source,
      confidence: "high",
    });
  }
  if (canonicalScan.vehicle.engine) {
    items.push({ type: "engine", value: canonicalScan.vehicle.engine, source, confidence: "medium" });
  }
  if (canonicalScan.vehicle.mileage) {
    items.push({ type: "mileage", value: canonicalScan.vehicle.mileage, source, confidence: "medium" });
  }

  if (scanCase.complaint) {
    items.push({ type: "complaint", value: scanCase.complaint, source: "user_reported", confidence: "high" });
  }
  for (const symptom of scanCase.symptoms) {
    items.push({ type: "symptom", value: symptom, source: "user_reported", confidence: "medium" });
  }
  if (scanCase.recent_repairs) {
    items.push({ type: "previous_repair", value: scanCase.recent_repairs, source: "user_reported", confidence: "medium" });
  }
  if (scanCase.technician_notes) {
    items.push({ type: "technician_note", value: scanCase.technician_notes, source: "technician_entered", confidence: "high" });
  }

  for (const dtc of canonicalScan.allDtcs) {
    const evidenceType: EvidenceType =
      dtc.status === "pending" ? "dtc_pending" : dtc.status === "permanent" ? "dtc_permanent" : "dtc_stored";
    items.push({
      type: evidenceType,
      value: { code: dtc.normalizedCode, description: dtc.description, systemName: dtc.systemName, status: dtc.status },
      source: "extraction",
      // A code with a real (non-generic) status and description is high-
      // confidence structured fact; an unresolved/unknown status is lower.
      confidence: dtc.status && dtc.status !== "unknown" ? "high" : "medium",
    });
    if (dtc.safetyRelevance) {
      items.push({
        type: "safety_issue",
        value: { code: dtc.normalizedCode, reason: "Flagged as a safety-relevant system fault." },
        source: "derived",
        confidence: "medium",
      });
    }

    // Phase 2.2 (docs/PHASE_2_2_EV_SAFETY_AUDIT.md root cause #1) —
    // detected independently of dtc.safetyRelevance, whose own pattern
    // (scan-diagnostics' SAFETY_SYSTEM_PATTERN) has no high-voltage/EV
    // vocabulary at all and would never flag a real HV fault. Gated on
    // status === "current" only — a historical/inactive HV code is not an
    // active hazard and must never trigger the deterministic immediate_stop
    // rule this evidence type feeds (safety.ts).
    if (dtc.status === "current") {
      const hazardCategory = detectHvHazardCategory(dtc.description);
      if (hazardCategory) {
        items.push({
          type: "hv_safety_hazard",
          value: { code: dtc.normalizedCode, hazardCategory, description: dtc.description },
          source: "derived",
          confidence: "high",
        });
      }
    }
  }

  if (extraction?.freeze_frame && extraction.freeze_frame.length > 0) {
    items.push({ type: "freeze_frame", value: extraction.freeze_frame, source: "extraction", confidence: "high" });
  }
  if (extraction?.live_data && extraction.live_data.length > 0) {
    items.push({ type: "live_data", value: extraction.live_data, source: "extraction", confidence: "high" });
  }

  return items;
}

// Turns a Question Engine answer into a persisted evidence item —
// `fieldKey` ties it back to the question that produced it (see
// docs/QUESTION_ENGINE.md), keeping evidence and the question/answer log
// in agreement about what's now known.
export function evidenceFromAnswer(fieldKey: string, answerText: string, answerValue: unknown): NewEvidenceItem {
  return {
    type: "question_answer",
    value: { fieldKey, answerText, answerValue: answerValue ?? answerText },
    source: "question_answer",
    confidence: "high",
  };
}
