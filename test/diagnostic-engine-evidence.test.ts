import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

const { insertEvidence, getEvidenceForCase, dedupeAgainstExisting, buildEvidenceFromCase, evidenceFromAnswer } =
  await import("@/lib/diagnostic-engine/evidence");
import type { ScanCase, ScanExtraction } from "@/lib/types";
import type { CanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

beforeEach(() => {
  fake().reset();
});

describe("insertEvidence / getEvidenceForCase", () => {
  it("returns [] without a round-trip when given no items", async () => {
    const result = await insertEvidence("case-1", []);
    expect(result).toEqual([]);
    expect(fake().dump("diagnostic_evidence")).toHaveLength(0);
  });

  it("persists items and reads them back ordered by recorded_at", async () => {
    await insertEvidence("case-1", [
      { type: "complaint", value: "Won't start", source: "user_reported", confidence: "high", recordedAt: "2026-01-02T00:00:00Z" },
      { type: "mileage", value: 88000, source: "extraction", confidence: "medium", recordedAt: "2026-01-01T00:00:00Z" },
    ]);

    const evidence = await getEvidenceForCase("case-1");
    expect(evidence).toHaveLength(2);
    expect(evidence[0].type).toBe("mileage");
    expect(evidence[1].type).toBe("complaint");
    expect(evidence[0].caseId).toBe("case-1");
  });
});

describe("dedupeAgainstExisting", () => {
  const existing: EvidenceItem[] = [
    { id: "e1", caseId: "case-1", type: "vin", value: "1HGCM82633A004352", source: "extraction", confidence: "high", recordedAt: "now" },
  ];

  it("filters out a candidate matching an existing (type, value) pair", () => {
    const result = dedupeAgainstExisting(existing, [
      { type: "vin", value: "1HGCM82633A004352", source: "extraction", confidence: "high" },
      { type: "mileage", value: 1000, source: "extraction", confidence: "medium" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("mileage");
  });

  it("keeps a candidate of the same type but a different value", () => {
    const result = dedupeAgainstExisting(existing, [{ type: "vin", value: "DIFFERENTVIN000001", source: "extraction", confidence: "high" }]);
    expect(result).toHaveLength(1);
  });
});

describe("buildEvidenceFromCase", () => {
  const baseCase: ScanCase = {
    id: "case-1",
    user_id: "user-1",
    status: "completed",
    complaint: "Check engine light on",
    symptoms: ["Rough idle", "Hesitation on acceleration"],
    mileage: null,
    recent_repairs: "Replaced spark plugs last month",
    battery_condition: null,
    technician_notes: "Customer reports intermittent issue",
    error_message: null,
    status_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as ScanCase;

  const canonicalScan: CanonicalVehicleScan = {
    vehicle: { vin: "1HGCM82633A004352", year: 2018, make: "Honda", model: "Accord", engine: "2.4L I4", mileage: 88000 },
    allDtcs: [
      { normalizedCode: "P0301", description: "Cylinder 1 Misfire", systemName: "Ignition", status: "stored", safetyRelevance: false },
      { normalizedCode: "P0420", description: "Catalyst Efficiency Below Threshold", systemName: "Emissions", status: "pending", safetyRelevance: true },
    ],
  } as unknown as CanonicalVehicleScan;

  it("derives vehicle, complaint, symptom, repair, note, and DTC evidence deterministically", () => {
    const items = buildEvidenceFromCase(baseCase, null, canonicalScan);

    expect(items.find((i) => i.type === "vin")?.value).toBe("1HGCM82633A004352");
    expect(items.find((i) => i.type === "complaint")?.value).toBe("Check engine light on");
    expect(items.filter((i) => i.type === "symptom")).toHaveLength(2);
    expect(items.find((i) => i.type === "previous_repair")?.value).toBe("Replaced spark plugs last month");
    expect(items.find((i) => i.type === "technician_note")?.source).toBe("technician_entered");

    const stored = items.find((i) => i.type === "dtc_stored");
    expect(stored).toBeDefined();
    const pending = items.find((i) => i.type === "dtc_pending");
    expect(pending).toBeDefined();

    // The safety-relevant DTC produces an additional safety_issue item.
    expect(items.filter((i) => i.type === "safety_issue")).toHaveLength(1);
  });

  it("includes freeze_frame/live_data only when the extraction actually has them", () => {
    const withoutExtraction = buildEvidenceFromCase(baseCase, null, canonicalScan);
    expect(withoutExtraction.some((i) => i.type === "freeze_frame")).toBe(false);

    const extraction = { freeze_frame: [{ rpm: 750 }], live_data: [] } as unknown as ScanExtraction;
    const withExtraction = buildEvidenceFromCase(baseCase, extraction, canonicalScan);
    expect(withExtraction.some((i) => i.type === "freeze_frame")).toBe(true);
    expect(withExtraction.some((i) => i.type === "live_data")).toBe(false);
  });
});

describe("buildEvidenceFromCase — high-voltage hazard derivation (Phase 2.2)", () => {
  const baseCase = {
    id: "case-hv",
    user_id: "user-1",
    status: "completed",
    complaint: "HV warning light, will not enter Ready mode",
    symptoms: [],
    mileage: null,
    recent_repairs: null,
    battery_condition: null,
    technician_notes: null,
    error_message: null,
    status_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as unknown as ScanCase;

  it("derives hv_safety_hazard evidence for a CURRENT-status DTC whose description matches an HV hazard keyword", () => {
    const canonicalScan: CanonicalVehicleScan = {
      vehicle: { vin: null, year: 2021, make: "Chevrolet", model: "Bolt EV" },
      allDtcs: [
        { normalizedCode: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", systemName: "HV Battery", status: "current", safetyRelevance: false },
      ],
    } as unknown as CanonicalVehicleScan;

    const items = buildEvidenceFromCase(baseCase, null, canonicalScan);
    const hvHazard = items.find((i) => i.type === "hv_safety_hazard");
    expect(hvHazard).toBeDefined();
    expect((hvHazard?.value as { hazardCategory?: string })?.hazardCategory).toBe("hv_isolation_fault");
    expect(hvHazard?.confidence).toBe("high");
  });

  it("never derives hv_safety_hazard for a historical/inactive-status DTC, even with matching HV text", () => {
    const canonicalScan: CanonicalVehicleScan = {
      vehicle: { vin: null, year: 2021, make: "Chevrolet", model: "Bolt EV" },
      allDtcs: [
        { normalizedCode: "P0AA6", description: "Hybrid/EV Battery Isolation Fault", systemName: "HV Battery", status: "history", safetyRelevance: false },
      ],
    } as unknown as CanonicalVehicleScan;

    const items = buildEvidenceFromCase(baseCase, null, canonicalScan);
    expect(items.some((i) => i.type === "hv_safety_hazard")).toBe(false);
  });

  it("never derives hv_safety_hazard for a CURRENT DTC whose description has no HV hazard language", () => {
    const canonicalScan: CanonicalVehicleScan = {
      vehicle: { vin: null, year: 2018, make: "Toyota", model: "Camry" },
      allDtcs: [
        { normalizedCode: "P0301", description: "Cylinder 1 Misfire Detected", systemName: "Ignition", status: "current", safetyRelevance: false },
      ],
    } as unknown as CanonicalVehicleScan;

    const items = buildEvidenceFromCase(baseCase, null, canonicalScan);
    expect(items.some((i) => i.type === "hv_safety_hazard")).toBe(false);
  });
});

describe("evidenceFromAnswer", () => {
  it("wraps a question-engine answer as high-confidence question_answer evidence", () => {
    const item = evidenceFromAnswer("crank_status", "Yes, it cranks", "yes");
    expect(item).toEqual({
      type: "question_answer",
      value: { fieldKey: "crank_status", answerText: "Yes, it cranks", answerValue: "yes" },
      source: "question_answer",
      confidence: "high",
    });
  });
});
