import { describe, expect, it } from "vitest";
import { decideRouting, detectUnsupportedClaims, type RoutingInput } from "@/lib/scan-diagnostics/ai/router";
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { SafetyReviewResult } from "@/lib/scan-diagnostics/safety-rules";

const BASE_INPUT: CanonicalDiagnosticInput = {
  caseId: "case-router-1",
  vehicle: { vin: "1FTFW1ET1EFA00001", year: 2019, make: "Ford", model: "F-150" },
  complaint: "Check engine light",
  symptoms: [],
  modules: [],
  dtcs: [{ code: "P0171", module: "ECM", status: "current", descriptionRaw: null }],
  systems: [],
  patterns: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: {
    pendingCodes: { status: "not_stated", codes: [] },
    permanentCodes: { status: "not_stated", codes: [] },
    networkFaults: { status: "not_stated", codes: [] },
    lostCommunicationFaults: { status: "not_stated", codes: [] },
    batteryRelatedFaults: { status: "not_stated", codes: [] },
  },
};

const BASE_OUTPUT: DiagnosticAiOutput = {
  summary: "Likely a vacuum leak.",
  rankedCauses: [
    {
      cause: "Vacuum leak",
      confidenceLevel: "medium",
      rationale: "Lean condition",
      supportingEvidence: [],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test"],
    },
  ],
  recommendedTests: [{ step: "Smoke test", purpose: "Find leak", expectedResult: "Smoke visible" }],
  safetyWarnings: [],
  missingInformation: [],
};

const PASS_SAFETY: SafetyReviewResult = { verdict: "pass", findings: [] };

function baseParams(overrides: Partial<RoutingInput> = {}): RoutingInput {
  return {
    caseId: "case-router-1",
    input: BASE_INPUT,
    output: BASE_OUTPUT,
    confidenceScore: 80,
    safety: PASS_SAFETY,
    budgetState: "normal",
    ...overrides,
  };
}

describe("decideRouting — primary path", () => {
  it("PRIMARY_ONLY when nothing triggers escalation and the case isn't sampled for audit", () => {
    const decision = decideRouting(baseParams({ qualityAuditPercentOverride: 0 }));
    expect(decision.escalateToReview).toBe(false);
    expect(decision.reason).toBe("PRIMARY_ONLY");
  });

  it("does NOT escalate solely because a case has multiple ordinary engine DTCs", () => {
    const manyDtcInput: CanonicalDiagnosticInput = {
      ...BASE_INPUT,
      dtcs: Array.from({ length: 10 }, (_, i) => ({ code: `P030${i}`, module: "ECM", status: "history", descriptionRaw: null })),
    };
    const decision = decideRouting(baseParams({ input: manyDtcInput, qualityAuditPercentOverride: 0 }));
    expect(decision.escalateToReview).toBe(false);
  });
});

describe("decideRouting — confidence", () => {
  it("LOW_CONFIDENCE when confidence is below the review threshold", () => {
    const decision = decideRouting(baseParams({ confidenceScore: 40, qualityAuditPercentOverride: 0 }));
    expect(decision.escalateToReview).toBe(true);
    expect(decision.reason).toBe("LOW_CONFIDENCE");
  });

  it("humanReviewRequired is true below the (lower) human-review threshold", () => {
    const decision = decideRouting(baseParams({ confidenceScore: 10, qualityAuditPercentOverride: 0 }));
    expect(decision.humanReviewRequired).toBe(true);
  });
});

describe("decideRouting — safety", () => {
  it("SAFETY_CRITICAL when the deterministic safety review blocked something", () => {
    const blockSafety: SafetyReviewResult = {
      verdict: "block",
      findings: [{ ruleId: "airbag-squib-circuit-probing", severity: "block", message: "unsafe" }],
    };
    const decision = decideRouting(baseParams({ safety: blockSafety, confidenceScore: 95 }));
    expect(decision.reason).toBe("SAFETY_CRITICAL");
    expect(decision.humanReviewRequired).toBe(true);
  });

  it("SAFETY_CRITICAL when a current fault exists in a safety-critical system, even with high confidence and passing safety review", () => {
    const srsInput: CanonicalDiagnosticInput = {
      ...BASE_INPUT,
      systems: [{ systemName: "SRS Airbag System", status: "faulted", dtcCountExtracted: 1, extractionComplete: true }],
    };
    const decision = decideRouting(baseParams({ input: srsInput, confidenceScore: 95 }));
    expect(decision.reason).toBe("SAFETY_CRITICAL");
  });

  it("SAFETY_CRITICAL takes priority over budget restriction", () => {
    const blockSafety: SafetyReviewResult = { verdict: "block", findings: [] };
    const decision = decideRouting(baseParams({ safety: blockSafety, budgetState: "restrict" }));
    expect(decision.escalateToReview).toBe(true);
    expect(decision.reason).toBe("SAFETY_CRITICAL");
  });
});

describe("decideRouting — contradictions and unsupported claims", () => {
  it("CONTRADICTORY_DATA when a ranked cause lists contradicting evidence", () => {
    const output: DiagnosticAiOutput = {
      ...BASE_OUTPUT,
      rankedCauses: [{ ...BASE_OUTPUT.rankedCauses[0], contradictingEvidence: ["Live data shows normal fuel trim"] }],
    };
    const decision = decideRouting(baseParams({ output, qualityAuditPercentOverride: 0 }));
    expect(decision.reason).toBe("CONTRADICTORY_DATA");
  });

  it("UNSUPPORTED_CLAIM when the output states a specific pin number or torque spec", () => {
    const output: DiagnosticAiOutput = {
      ...BASE_OUTPUT,
      rankedCauses: [{ ...BASE_OUTPUT.rankedCauses[0], rationale: "Check pin 12 at the connector for continuity." }],
    };
    expect(detectUnsupportedClaims(output).length).toBeGreaterThan(0);
    const decision = decideRouting(baseParams({ output, qualityAuditPercentOverride: 0 }));
    expect(decision.reason).toBe("UNSUPPORTED_CLAIM");
  });
});

describe("decideRouting — budget gating", () => {
  it("BUDGET_LIMIT suppresses an otherwise-low-confidence escalation at the restrict budget state", () => {
    const decision = decideRouting(baseParams({ confidenceScore: 40, budgetState: "restrict" }));
    expect(decision.escalateToReview).toBe(false);
    expect(decision.reason).toBe("BUDGET_LIMIT");
  });

  it("BUDGET_LIMIT suppresses escalation at hard_stop too", () => {
    const decision = decideRouting(baseParams({ confidenceScore: 40, budgetState: "hard_stop" }));
    expect(decision.escalateToReview).toBe(false);
    expect(decision.reason).toBe("BUDGET_LIMIT");
  });
});

describe("decideRouting — multimodal and quality audit", () => {
  it("MULTIMODAL_REQUIRED (but does not escalate) for an image-only PDF source", () => {
    const decision = decideRouting(baseParams({ input: { ...BASE_INPUT, imageOnlyPdf: true }, qualityAuditPercentOverride: 0 }));
    expect(decision.reason).toBe("MULTIMODAL_REQUIRED");
    expect(decision.escalateToReview).toBe(false);
  });

  it("QUALITY_AUDIT sampling is stable for the same caseId across repeated calls", () => {
    const first = decideRouting(baseParams({ qualityAuditPercentOverride: 100 }));
    const second = decideRouting(baseParams({ qualityAuditPercentOverride: 100 }));
    expect(first.reason).toBe("QUALITY_AUDIT");
    expect(second.reason).toBe("QUALITY_AUDIT");

    const never = decideRouting(baseParams({ qualityAuditPercentOverride: 0 }));
    expect(never.reason).not.toBe("QUALITY_AUDIT");
  });
});
