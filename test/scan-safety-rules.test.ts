import { describe, expect, it } from "vitest";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";
import type { DiagnosticAiOutput, CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

const BASE_INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: {},
  symptoms: [],
  modules: [],
  dtcs: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
};

function output(overrides: Partial<DiagnosticAiOutput>): DiagnosticAiOutput {
  return {
    summary: "Diagnostic summary.",
    rankedCauses: [
      {
        cause: "Faulty oxygen sensor",
        probabilityPercent: 70,
        rationale: "Lean code pattern consistent with sensor drift.",
        supportingEvidence: ["P0171 present"],
        contradictingEvidence: [],
      },
    ],
    recommendedTests: [
      { step: "Test O2 sensor voltage response", purpose: "Confirm sensor function", expectedResult: "Voltage swings 0.1-0.9V" },
    ],
    safetyWarnings: [],
    missingInformation: [],
    ...overrides,
  };
}

describe("runSafetyReview", () => {
  it("passes clean, well-tested guidance", () => {
    const result = runSafetyReview(output({}), BASE_INPUT);
    expect(result.verdict).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("blocks a high-cost module replacement recommended with zero tests", () => {
    const result = runSafetyReview(
      output({
        rankedCauses: [
          {
            cause: "Replace the BCM",
            probabilityPercent: 80,
            rationale: "Multiple network faults suggest BCM failure.",
            supportingEvidence: [],
            contradictingEvidence: [],
          },
        ],
        recommendedTests: [],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "high-cost-module-replacement-no-tests")).toBe(true);
  });

  it("warns (not blocks) a module replacement when tests exist but none reference that module", () => {
    const result = runSafetyReview(
      output({
        rankedCauses: [
          {
            cause: "Replace the TCM",
            probabilityPercent: 65,
            rationale: "Shift faults observed.",
            supportingEvidence: [],
            contradictingEvidence: [],
          },
        ],
        recommendedTests: [
          { step: "Check battery voltage", purpose: "Rule out low-voltage cause", expectedResult: "Above 12.4V" },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("warn");
    expect(result.findings.some((f) => f.ruleId === "high-cost-module-replacement-untested")).toBe(true);
  });

  it("does not warn when a recommended test explicitly targets the replaced module", () => {
    const result = runSafetyReview(
      output({
        rankedCauses: [
          {
            cause: "Replace the TCM",
            probabilityPercent: 65,
            rationale: "Shift faults observed.",
            supportingEvidence: [],
            contradictingEvidence: [],
          },
        ],
        recommendedTests: [
          { step: "Bench-test the TCM output signals", purpose: "Confirm TCM failure", expectedResult: "No output on failed channel" },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("pass");
  });

  it("blocks high-voltage EV content with no PPE/lockout-tagout warning", () => {
    const result = runSafetyReview(
      output({
        recommendedTests: [
          {
            step: "Disconnect the high-voltage battery and inspect the orange cable",
            purpose: "Check for damage",
            expectedResult: "No visible damage",
          },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "ev-high-voltage-missing-ppe-warning")).toBe(true);
  });

  it("passes high-voltage content when a qualified-technician/PPE warning is present", () => {
    const result = runSafetyReview(
      output({
        safetyWarnings: [
          "High-voltage battery work requires a qualified technician with proper PPE and lockout/tagout procedure.",
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("pass");
  });

  it("always blocks airbag squib circuit probing guidance", () => {
    const result = runSafetyReview(
      output({
        recommendedTests: [
          { step: "Measure resistance across the airbag squib circuit", purpose: "Check continuity", expectedResult: "2-3 ohms" },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "airbag-squib-circuit-probing")).toBe(true);
  });

  it("always blocks immobilizer bypass guidance", () => {
    const result = runSafetyReview(
      output({ summary: "To resolve this, bypass the immobilizer and clear the fault." }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "immobilizer-security-bypass")).toBe(true);
  });
});
