import { describe, expect, it, vi, beforeEach } from "vitest";
import type { FakeSupabase } from "./mocks/fake-supabase";
import type { DiagnosticAIProvider, DiagnosticAIProviderResult } from "@/lib/scan-diagnostics/ai/provider";
import type { CanonicalDiagnosticInput, DiagnosticAiOutput } from "@/lib/scan-diagnostics/schemas";
import type { ScanCase, ScanDtcRecord, ScanExtraction } from "@/lib/types";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { computeDiagnosticPriority } from "@/lib/scan-diagnostics/priority";
import { detectPatterns } from "@/lib/scan-diagnostics/patterns";
import { buildUserPrompt, DEFAULT_SYSTEM_PROMPT } from "@/lib/scan-diagnostics/ai/shared-prompt";
import { sanitizeMissingInformation } from "@/lib/scan-diagnostics/confidence";
import { runSafetyReview } from "@/lib/scan-diagnostics/safety-rules";

vi.mock("@/lib/supabase/admin", async () => {
  const { createFakeSupabase } = await import("./mocks/fake-supabase");
  const fake = createFakeSupabase();
  (globalThis as Record<string, unknown>).__fakeSupabase = fake;
  return { createAdminClient: () => fake };
});

function fake(): FakeSupabase {
  return (globalThis as Record<string, unknown>).__fakeSupabase as FakeSupabase;
}

// Forces @/lib/supabase/admin (and therefore the vi.mock above) to resolve
// at module load time, before any beforeEach/it callback runs — a dynamic
// import() inside an it() runs too late, after beforeEach already tried to
// call fake() on an unset globalThis.__fakeSupabase. Mirrors the top-level
// import pattern in test/scan-analyze-route.test.ts.
const { runScanAnalysis } = await import("@/lib/scan-diagnostics/analyze");

// Regression coverage for the 2014 Range Rover Sport case (VIN
// SALWA2VF7EA501249) described in "Claude Code Master Prompt — Audit and
// Fix DTCDecoder Diagnostic Pipeline": a technician-supplied complaint
// ("Vehicle does not start") was reported as "Not provided," BCM/RFA module
// attribution was lost, Permanent/Intermittent DTCs were miscategorized as
// historical/reference-only with a misleading "Current: 0, History: 0"
// display, and a legitimate immobilizer-diagnosis recommendation tripped
// the security-bypass safety block. None of the fixtures below reference
// the VIN or "Land Rover" in any code path under test — every assertion
// exercises the same generic, make/model-agnostic logic every case goes
// through, proving the fix is not a case-specific carve-out.

const LR_VIN = "SALWA2VF7EA501249";
const LR_COMPLAINT = "Vehicle does not start";

function landRoverCase(id: string, userId: string): ScanCase {
  return {
    id,
    user_id: userId,
    status: "ready_for_analysis",
    complaint: LR_COMPLAINT,
    symptoms: ["No crank", "No start"],
    mileage: 71200,
    recent_repairs: null,
    battery_condition: null,
    technician_notes: null,
  } as ScanCase;
}

function landRoverExtraction(caseId: string): ScanExtraction {
  return {
    id: "ext-lr-1",
    case_id: caseId,
    vin: LR_VIN,
    make: "Land Rover",
    model: "Range Rover Sport",
    model_year: 2014,
    engine: null,
    odometer_miles: 71200,
    modules: [{ name: "BCM" }, { name: "RFA" }],
    freeze_frame: [],
    live_data: [],
    image_only_pdf: false,
    warnings: [],
    reviewed_fields: {},
  } as unknown as ScanExtraction;
}

// Deliberately populates only `system_name` (never `module`) on every
// record — this is exactly how the text/PDF parser stores a DTC's owning
// module heading (see system-sections.ts), and is the shape that exposed
// the original module-attribution-loss bug. If `module` were populated
// directly instead, the coalesce fix in canonical-input.ts would never be
// exercised.
function landRoverDtcRecords(caseId: string): ScanDtcRecord[] {
  const base = {
    case_id: caseId,
    source: "extracted" as const,
    created_at: new Date(0).toISOString(),
    module: null,
    source_page: null,
    source_text: null,
    safety_relevance: false,
    network_relevance: false,
    battery_relevance: false,
    bus_off_relevance: false,
    source_image_index: null,
  };
  return [
    { ...base, id: "dtc-lr-1", code: "B100D-67", status: "permanent", system_name: "BCM", description_raw: "Ignition switch signal invalid" },
    { ...base, id: "dtc-lr-2", code: "U201B-54", status: "permanent", system_name: "BCM", description_raw: "Lost communication with RFA module" },
    { ...base, id: "dtc-lr-3", code: "U3000-46", status: "intermittent", system_name: "RFA", description_raw: "Control module internal fault" },
    { ...base, id: "dtc-lr-4", code: "B10A9-00", status: "intermittent", system_name: "RFA", description_raw: "Immobilizer authorization signal fault" },
  ] as unknown as ScanDtcRecord[];
}

function buildInput(caseId: string, userId: string): CanonicalDiagnosticInput {
  return buildCanonicalDiagnosticInput(
    landRoverCase(caseId, userId),
    landRoverExtraction(caseId),
    landRoverDtcRecords(caseId),
    [],
  );
}

describe("Land Rover regression — canonical input (before the AI call)", () => {
  it("complaint reaches the canonical input unchanged", () => {
    const input = buildInput("lr-case-1", "user-lr");
    expect(input.complaint).toBe(LR_COMPLAINT);
  });

  it("preserves BCM/RFA module attribution for every DTC (module ?? system_name coalesce)", () => {
    const input = buildInput("lr-case-1", "user-lr");
    const byCode = Object.fromEntries(input.dtcs.map((d) => [d.code, d.module]));
    expect(byCode["B100D-67"]).toBe("BCM");
    expect(byCode["U201B-54"]).toBe("BCM");
    expect(byCode["U3000-46"]).toBe("RFA");
    expect(byCode["B10A9-00"]).toBe("RFA");
  });

  it("preserves Permanent/Intermittent statuses (never collapsed to a generic bucket)", () => {
    const input = buildInput("lr-case-1", "user-lr");
    const byCode = Object.fromEntries(input.dtcs.map((d) => [d.code, d.status]));
    expect(byCode["B100D-67"]).toBe("permanent");
    expect(byCode["U201B-54"]).toBe("permanent");
    expect(byCode["U3000-46"]).toBe("intermittent");
    expect(byCode["B10A9-00"]).toBe("intermittent");
  });
});

describe("Land Rover regression — actual prompt text sent to the model", () => {
  it("includes the real complaint, never the 'not provided' placeholder", () => {
    const input = buildInput("lr-case-1", "user-lr");
    const prompt = buildUserPrompt(input, new Map());
    expect(prompt).toContain(LR_COMPLAINT);
    expect(prompt).not.toMatch(/CUSTOMER COMPLAINT \/ SYMPTOMS\nnot provided/);
  });

  it("includes BCM and RFA module attribution and Permanent/Intermittent statuses per DTC line", () => {
    const input = buildInput("lr-case-1", "user-lr");
    const prompt = buildUserPrompt(input, new Map());
    expect(prompt).toContain("B100D-67, module: BCM, status: permanent");
    expect(prompt).toContain("U201B-54, module: BCM, status: permanent");
    expect(prompt).toContain("U3000-46, module: RFA, status: intermittent");
    expect(prompt).toContain("B10A9-00, module: RFA, status: intermittent");
  });

  it("carries the U-code overclassification caveat in the system prompt (Option A: classification stays broad, caveat is prompt-level)", () => {
    // Verifies Item 1's fix lives where Option A specified — the system
    // prompt, not a change to the deterministic classifier itself.
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/leading "U"/);
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/does not by itself establish/i);
  });
});

describe("Land Rover regression — health summary and priority (no false Current=0 implication)", () => {
  it("reports currentCount 0 but permanentCount 2 and intermittentCount 2 — the real fault counts are visible", () => {
    const scanCase = landRoverCase("lr-case-2", "user-lr");
    const extraction = landRoverExtraction("lr-case-2");
    const dtcRecords = landRoverDtcRecords("lr-case-2");
    const scan = buildCanonicalVehicleScan(scanCase, extraction, dtcRecords, []);

    expect(scan.derivedCategories.currentCodes).toHaveLength(0);
    expect(scan.derivedCategories.historyCodes).toHaveLength(0);
    expect(scan.derivedCategories.permanentCodes).toHaveLength(2);
    expect(scan.derivedCategories.intermittentCodes).toHaveLength(2);
    expect(scan.allDtcs).toHaveLength(4);
  });

  it("routes Permanent DTCs to diagnoseNext and Intermittent DTCs to monitorRecheck — never historicalReference", () => {
    const scanCase = landRoverCase("lr-case-2", "user-lr");
    const extraction = landRoverExtraction("lr-case-2");
    const dtcRecords = landRoverDtcRecords("lr-case-2");
    const scan = buildCanonicalVehicleScan(scanCase, extraction, dtcRecords, []);
    const patterns = detectPatterns(scan);
    const priority = computeDiagnosticPriority(scan, patterns);

    const diagnoseNextCodes = priority.diagnoseNext.map((d) => d.normalizedCode);
    const monitorRecheckCodes = priority.monitorRecheck.map((d) => d.normalizedCode);
    const historicalCodes = priority.historicalReference.map((d) => d.normalizedCode);

    expect(diagnoseNextCodes).toEqual(expect.arrayContaining(["B100D-67", "U201B-54"]));
    expect(monitorRecheckCodes).toEqual(expect.arrayContaining(["U3000-46", "B10A9-00"]));
    expect(historicalCodes).toHaveLength(0);
  });
});

describe("Land Rover regression — AI missing-complaint contradiction blocked", () => {
  it("removes a hallucinated 'no complaint provided' claim when the case actually has one", () => {
    const input = buildInput("lr-case-3", "user-lr");
    const { sanitized, removed } = sanitizeMissingInformation(
      ["No customer complaint was provided.", "No live data was captured."],
      input,
    );
    expect(removed).toEqual(["No customer complaint was provided."]);
    expect(sanitized).toEqual(["No live data was captured."]);
  });
});

describe("Land Rover regression — legitimate immobilizer diagnosis allowed, real bypass still blocked", () => {
  const baseOutput: DiagnosticAiOutput = {
    summary: "Investigate immobilizer/RFA fault chain.",
    rankedCauses: [
      {
        cause: "RFA/immobilizer communication fault",
        confidenceLevel: "medium",
        complaintCorrelation: "strong",
        rationale: "",
        supportingEvidence: [],
        contradictingEvidence: [],
        confirmationTestsRequired: ["Read immobilizer authorization status via scan tool"],
      },
    ],
    recommendedTests: [
      { step: "Read immobilizer authorization status", purpose: "Confirm RFA sees a valid key signal", expectedResult: "Authorization status reads valid" },
    ],
    safetyWarnings: [],
    missingInformation: [],
  };

  it("does not block a legitimate immobilizer diagnosis/read-status recommendation", () => {
    const input = buildInput("lr-case-4", "user-lr");
    const output: DiagnosticAiOutput = {
      ...baseOutput,
      rankedCauses: [
        {
          ...baseOutput.rankedCauses[0],
          rationale:
            "Confirm the technician does not need to bypass the immobilizer — read its authorization status first to isolate the RFA fault before any component replacement.",
        },
      ],
    };
    const review = runSafetyReview(output, input);
    expect(review.findings.map((f) => f.ruleId)).not.toContain("immobilizer-security-bypass");
    expect(review.verdict).not.toBe("block");
  });

  it("still blocks a genuine immobilizer-bypass instruction", () => {
    const input = buildInput("lr-case-4", "user-lr");
    const output: DiagnosticAiOutput = {
      ...baseOutput,
      rankedCauses: [
        { ...baseOutput.rankedCauses[0], rationale: "Bypass the immobilizer to confirm the starter circuit independently." },
      ],
    };
    const review = runSafetyReview(output, input);
    expect(review.findings.map((f) => f.ruleId)).toContain("immobilizer-security-bypass");
    expect(review.verdict).toBe("block");
  });
});

describe("Land Rover regression — end-to-end pipeline (no hard-coded make/model logic)", () => {
  function seedLandRoverCase(caseId: string, userId: string) {
    fake().seed("scan_cases", [landRoverCase(caseId, userId) as unknown as Record<string, unknown>]);
    fake().seed("scan_extractions", [landRoverExtraction(caseId) as unknown as Record<string, unknown>]);
    fake().seed("scan_dtc_records", landRoverDtcRecords(caseId) as unknown as Record<string, unknown>[]);
  }

  beforeEach(() => {
    fake().reset();
    fake().setRpcHandler("record_ai_diagnostic_usage", (args) => {
      const userId = args.p_user_id as string;
      const requestId = args.p_request_id as string;
      const already = fake()
        .dump("ai_diagnostic_usage")
        .some((r) => r.user_id === userId && r.request_id === requestId);
      if (already) return "already_recorded";
      fake().seed("ai_diagnostic_usage", [
        { user_id: userId, request_id: requestId, feature: "scan_report", access_level: "full", created_at: new Date().toISOString() },
      ]);
      return "recorded";
    });
    fake().setRpcHandler("redeem_single_report_purchase", () => false);
  });

  it("runScanAnalysis: complaint/module/status reach the provider intact, and a hallucinated missing-complaint claim is stripped from the persisted report", async () => {
    seedLandRoverCase("lr-e2e-1", "user-lr");

    let capturedInput: CanonicalDiagnosticInput | null = null;
    // Deliberately generic output — nothing here references Land Rover,
    // Range Rover, or the VIN. Proves the pipeline treats this case exactly
    // like any other and applies no case-specific logic.
    const provider: DiagnosticAIProvider = {
      id: "fake-provider",
      async runDiagnosis(input) {
        capturedInput = input;
        const result: DiagnosticAIProviderResult = {
          providerId: "fake-provider",
          modelId: "fake-model",
          promptVersion: "2026-08-complaint-evidence-v3",
          output: {
            summary: "No-start with BCM/RFA permanent and intermittent faults.",
            rankedCauses: [
              {
                cause: "RFA/immobilizer authorization fault preventing start",
                confidenceLevel: "medium",
                complaintCorrelation: "strong",
                rationale: "BCM and RFA permanent/intermittent codes correlate with the reported no-start.",
                supportingEvidence: ["Complaint states vehicle does not start"],
                contradictingEvidence: [],
                confirmationTestsRequired: ["Read immobilizer authorization status"],
              },
            ],
            recommendedTests: [
              { step: "Read immobilizer authorization status", purpose: "Confirm RFA sees a valid key signal", expectedResult: "Authorization status reads valid" },
            ],
            safetyWarnings: [],
            // Deliberately hallucinated to prove the deterministic guard
            // (Item 2) strips it before persistence, even end-to-end.
            missingInformation: ["No customer complaint was provided."],
          },
          tokens: { input: 400, output: 300 },
        };
        return result;
      },
    };

    const result = await runScanAnalysis("user-lr", "lr-e2e-1", "pro", provider);

    expect(result.case.status).toBe("completed");
    expect(capturedInput).not.toBeNull();
    expect(capturedInput!.complaint).toBe(LR_COMPLAINT);
    const byCode = Object.fromEntries(capturedInput!.dtcs.map((d) => [d.code, { module: d.module, status: d.status }]));
    expect(byCode["B100D-67"]).toEqual({ module: "BCM", status: "permanent" });
    expect(byCode["U201B-54"]).toEqual({ module: "BCM", status: "permanent" });
    expect(byCode["U3000-46"]).toEqual({ module: "RFA", status: "intermittent" });
    expect(byCode["B10A9-00"]).toEqual({ module: "RFA", status: "intermittent" });

    expect(result.report.missing_information).not.toContain("No customer complaint was provided.");
    expect(result.report.safety_warnings as unknown as Array<{ ruleId: string }>).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: "immobilizer-security-bypass" })]),
    );
  });
});
