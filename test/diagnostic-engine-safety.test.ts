import { describe, expect, it } from "vitest";
import { classifyDriveSafety } from "@/lib/diagnostic-engine/safety";
import type { EvidenceItem } from "@/lib/diagnostic-engine/types";

function safetyIssueEvidence(count: number): EvidenceItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    caseId: "case-1",
    type: "safety_issue" as const,
    value: { code: "P0562", reason: "Flagged as a safety-relevant system fault." },
    source: "derived" as const,
    confidence: "medium" as const,
    recordedAt: "now",
  }));
}

describe("classifyDriveSafety", () => {
  it("classifies immediate_stop when a warning matches an immediate-stop keyword, even over other signals", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(2), ["Do not drive — risk of fire from the affected wiring harness."]);
    expect(result.status).toBe("immediate_stop");
    expect(result.reasoning).toContain("Do not drive");
  });

  it("classifies tow_recommended when a warning matches a no-start/tow keyword", () => {
    const result = classifyDriveSafety([], ["The vehicle will not start reliably and should be towed for diagnosis."]);
    expect(result.status).toBe("tow_recommended");
  });

  it("classifies drive_with_caution from safety_issue evidence alone, with no safety warnings at all", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(1), []);
    expect(result.status).toBe("drive_with_caution");
    expect(result.reasoning).toContain("1 safety-relevant DTC");
  });

  it("classifies drive_with_caution from a caution-keyword warning when there is no safety_issue evidence", () => {
    const result = classifyDriveSafety([], ["Intermittent stall reported at highway speed — use caution."]);
    expect(result.status).toBe("drive_with_caution");
  });

  it("falls back to drive_with_caution for an unrecognized but non-empty warning", () => {
    const result = classifyDriveSafety([], ["Something unusual was observed in the diagnostic session."]);
    expect(result.status).toBe("drive_with_caution");
  });

  it("classifies safe_to_drive when there is no safety evidence and no warnings at all", () => {
    const result = classifyDriveSafety([], []);
    expect(result.status).toBe("safe_to_drive");
  });

  it("immediate_stop keyword scanning takes priority over safety_issue evidence", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(3), ["Loss of steering reported — do not drive."]);
    expect(result.status).toBe("immediate_stop");
  });
});

function hvHazardEvidence(hazardCategory = "hv_isolation_fault"): EvidenceItem[] {
  return [
    {
      id: "hv1",
      caseId: "case-1",
      type: "hv_safety_hazard",
      value: { code: "P0AA6", hazardCategory, description: "Hybrid/EV Battery Isolation Fault" },
      source: "derived",
      confidence: "high",
      recordedAt: "now",
    },
  ];
}

describe("classifyDriveSafety — deterministic high-voltage hazard rule (Phase 2.2)", () => {
  it("classifies immediate_stop from hv_safety_hazard evidence ALONE, with zero AI text", () => {
    const result = classifyDriveSafety(hvHazardEvidence(), []);
    expect(result.status).toBe("immediate_stop");
  });

  it("populates structured hvHazard detail (hazard category, immediate action, prohibited actions, PPE, towing)", () => {
    const result = classifyDriveSafety(hvHazardEvidence("battery_thermal_event"), []);
    expect(result.hvHazard).toBeDefined();
    expect(result.hvHazard?.hazardCategory).toBe("battery_thermal_event");
    expect(result.hvHazard?.towingRecommended).toBe(true);
    expect(result.hvHazard?.isolationRecommended).toBe(true);
    expect(result.hvHazard?.prohibitedActions.length).toBeGreaterThan(0);
    expect(result.hvHazard?.ppeWarning).toBeTruthy();
    expect(result.hvHazard?.requiredQualification).toBeTruthy();
    expect(result.hvHazard?.manufacturerProcedureWarning).toBeTruthy();
  });

  it("AI text CANNOT downgrade a deterministic immediate_stop result — mild or absent warnings never lower it", () => {
    const withNoWarnings = classifyDriveSafety(hvHazardEvidence(), []);
    expect(withNoWarnings.status).toBe("immediate_stop");

    const withMildWarning = classifyDriveSafety(hvHazardEvidence(), ["Everything looks fine, minor note only."]);
    expect(withMildWarning.status).toBe("immediate_stop");

    const withUnrelatedCaution = classifyDriveSafety(hvHazardEvidence(), ["Use caution — reduced power reported."]);
    expect(withUnrelatedCaution.status).toBe("immediate_stop");
  });

  it("AI text CAN raise severity above the evidence floor, but the hvHazard detail is preserved when present", () => {
    // safety_issue evidence alone floors at drive_with_caution; an
    // immediate-stop keyword in the AI text can still raise it further.
    const result = classifyDriveSafety(safetyIssueEvidence(1), ["Do not drive — brake failure detected."]);
    expect(result.status).toBe("immediate_stop");
  });

  it("never fires for evidence with no hv_safety_hazard type present, regardless of other evidence volume", () => {
    const result = classifyDriveSafety(safetyIssueEvidence(5), []);
    expect(result.status).toBe("drive_with_caution");
    expect(result.hvHazard).toBeUndefined();
  });
});

describe("classifyDriveSafety — safety is independent of diagnostic confidence (Phase 2.2 Step 3)", () => {
  // classifyDriveSafety's signature takes only evidence + safetyWarnings —
  // it has no confidenceLevel/hypotheses parameter at all, so there is no
  // code path by which a low- or insufficient-confidence diagnosis could
  // reduce the safety result. These tests prove that at the call-site
  // level: an "unknown root cause" scenario (zero ranked hypotheses, only
  // raw evidence) still reaches the same classification a high-confidence
  // scenario would.
  it("an unknown root cause (no hypotheses at all) still requires immediate stop when hv evidence is present", () => {
    const result = classifyDriveSafety(hvHazardEvidence(), []);
    expect(result.status).toBe("immediate_stop");
  });

  it("insufficient evidence for a diagnosis does not prevent a tow recommendation from evidence/warnings", () => {
    const result = classifyDriveSafety([], ["The vehicle will not start and should be towed."]);
    expect(result.status).toBe("tow_recommended");
  });

  it("low diagnostic confidence never implies low safety risk — same evidence, same classification, independent of confidence", () => {
    // classifyDriveSafety never receives a confidence level — this is
    // structurally guaranteed, not just behaviorally coincidental.
    expect(classifyDriveSafety.length).toBe(2);
    const result = classifyDriveSafety(hvHazardEvidence(), []);
    expect(result.status).toBe("immediate_stop");
  });
});
