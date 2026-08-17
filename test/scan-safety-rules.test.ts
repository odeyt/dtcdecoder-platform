import { describe, expect, it } from "vitest";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { DiagnosticAiOutput, CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

const BASE_INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: {},
  symptoms: [],
  modules: [],
  dtcs: [],
  systems: [],
  patterns: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: classifyDtcCategories([], []),
};

function output(overrides: Partial<DiagnosticAiOutput>): DiagnosticAiOutput {
  return {
    summary: "Diagnostic summary.",
    rankedCauses: [
      {
        cause: "Faulty oxygen sensor",
        confidenceLevel: "medium",
        complaintCorrelation: "unknown",
        rationale: "Lean code pattern consistent with sensor drift.",
        supportingEvidence: ["P0171 present"],
        contradictingEvidence: [],
        confirmationTestsRequired: ["Test O2 sensor voltage response"],
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
            confidenceLevel: "high",
            complaintCorrelation: "unknown",
            rationale: "Multiple network faults suggest BCM failure.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
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
            confidenceLevel: "medium",
            complaintCorrelation: "unknown",
            rationale: "Shift faults observed.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
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
            confidenceLevel: "medium",
            complaintCorrelation: "unknown",
            rationale: "Shift faults observed.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
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

  it("warns when a module replacement is suggested for a communication-fault code without power/ground/network tests", () => {
    const result = runSafetyReview(
      output({
        rankedCauses: [
          {
            cause: "Replace the BCM",
            confidenceLevel: "medium",
            complaintCorrelation: "unknown",
            rationale: "Multiple modules report lost communication, pointing to a failed BCM.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
          },
        ],
        recommendedTests: [
          { step: "Scan for additional codes", purpose: "Confirm scope", expectedResult: "No new codes" },
        ],
      }),
      BASE_INPUT,
    );
    expect(
      result.findings.some((f) => f.ruleId === "comm-fault-module-replacement-without-power-ground-network-tests"),
    ).toBe(true);
  });

  it("does not fire the comm-fault rule when a power/ground/network test is actually recommended", () => {
    const result = runSafetyReview(
      output({
        rankedCauses: [
          {
            cause: "Replace the BCM",
            confidenceLevel: "medium",
            complaintCorrelation: "unknown",
            rationale: "Multiple modules report lost communication with the BCM.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
          },
        ],
        recommendedTests: [
          {
            step: "Test BCM power and ground circuits, then check network topology and termination",
            purpose: "Rule out a wiring/power cause before replacing the module",
            expectedResult: "Power and ground within spec, termination resistance correct",
          },
        ],
      }),
      BASE_INPUT,
    );
    expect(
      result.findings.some((f) => f.ruleId === "comm-fault-module-replacement-without-power-ground-network-tests"),
    ).toBe(false);
  });

  it("always blocks immobilizer bypass guidance", () => {
    const result = runSafetyReview(
      output({ summary: "To resolve this, bypass the immobilizer and clear the fault." }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "immobilizer-security-bypass")).toBe(true);
  });

  // Regression for a real false positive: legitimate OEM-style diagnosis of
  // the immobilizer/key-authentication/start-authorization chain must be
  // allowed — the bypass rule exists to block actual defeat/circumvent
  // instructions, not any mention of these systems at all.
  it("allows legitimate immobilizer/start-authorization diagnostic guidance, never blocks it", () => {
    const result = runSafetyReview(
      output({
        summary: "No-start complaint correlates with a column-lock authorization DTC.",
        rankedCauses: [
          {
            cause: "Column-lock/start-authorization chain",
            confidenceLevel: "medium",
            complaintCorrelation: "strong",
            rationale: "B100D-67 (Column Lock Authorisation, permanent) directly correlates with the no-start complaint.",
            supportingEvidence: ["Permanent column-lock authorization fault present"],
            contradictingEvidence: [],
            confirmationTestsRequired: [
              "Read immobilizer authorization status",
              "Check smart-key validity and confirm the key is recognized",
              "Read column-lock authorization and actual state",
              "Verify RFA configuration and programmed-key count",
              "Follow the OEM start-authorization initialization procedure",
            ],
          },
        ],
        recommendedTests: [
          {
            step: "Read immobilizer authorization and start-authorization status with a scan tool",
            purpose: "Confirm whether the BCM/RFA are granting start authorization before suspecting the column lock itself",
            expectedResult: "Authorization status matches expected state for a valid, recognized key",
          },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("pass");
    expect(result.findings.some((f) => f.ruleId === "immobilizer-security-bypass")).toBe(false);
  });

  it("does not block a cautionary sentence that mentions bypassing the immobilizer only to say not to", () => {
    const result = runSafetyReview(
      output({
        summary: "Confirm the technician does not need to bypass the immobilizer to complete this test.",
      }),
      BASE_INPUT,
    );
    expect(result.findings.some((f) => f.ruleId === "immobilizer-security-bypass")).toBe(false);
  });

  it("still blocks a genuine bypass instruction even when a negated sentence appears elsewhere in the same output", () => {
    const result = runSafetyReview(
      output({
        summary: "Do not attempt to bypass the immobilizer under normal circumstances.",
        rankedCauses: [
          {
            cause: "Bad idea",
            confidenceLevel: "low",
            complaintCorrelation: "unknown",
            rationale: "As a shortcut, bypass the immobilizer and hot-wire the starter circuit directly.",
            supportingEvidence: [],
            contradictingEvidence: [],
            confirmationTestsRequired: [],
          },
        ],
      }),
      BASE_INPUT,
    );
    expect(result.verdict).toBe("block");
    expect(result.findings.some((f) => f.ruleId === "immobilizer-security-bypass")).toBe(true);
  });
});
