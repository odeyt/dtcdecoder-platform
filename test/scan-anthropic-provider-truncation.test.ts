import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import { AiResponseValidationError } from "@/lib/scan-diagnostics/api-errors";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

// Regression cover for a production failure on a paid subscriber's
// "Professional Scan Analysis": the model returned a tool_use block whose
// input was missing `summary` and `safetyWarnings`, the Zod parse failed,
// and the customer saw "AI analysis failed. Please try again." with no way
// to tell a truncated response from a genuinely malformed one.

vi.mock("@/lib/scan-diagnostics/dtc-grounding", () => ({
  findKnownDtcContext: async () => new Map(),
}));

vi.mock("@/lib/env", () => ({
  env: { anthropicApiKey: () => "test-key" },
}));

// getScanSystemPrompt reads an optional admin override; returning no row
// exercises the DEFAULT_SYSTEM_PROMPT path.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
  }),
}));

vi.mock("@anthropic-ai/sdk", () => {
  const state: { queue: unknown[]; calls: number } = { queue: [], calls: 0 };
  (globalThis as Record<string, unknown>).__anthropicMockState = state;

  class FakeAnthropic {
    messages = {
      create: async () => {
        state.calls += 1;
        const next = state.queue.shift();
        if (!next) throw new Error("no queued Anthropic response for this call");
        return next;
      },
    };
    constructor(_opts: unknown) {}
  }

  return { default: FakeAnthropic };
});

const { AnthropicDiagnosticProvider, SCAN_REPORT_MAX_TOKENS } = await import(
  "@/lib/scan-diagnostics/ai/anthropic-provider"
);

function mockState() {
  return (globalThis as Record<string, unknown>).__anthropicMockState as { queue: unknown[]; calls: number };
}

const VALID_OUTPUT = {
  summary: "Likely an intake leak upstream of the MAF.",
  rankedCauses: [
    {
      cause: "Vacuum leak downstream of the MAF sensor",
      confidenceLevel: "medium",
      rationale: "Lean bank-1 code with no fuel-trim correction at idle.",
      supportingEvidence: ["P0171 current"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke-test the intake tract"],
    },
  ],
  recommendedTests: [{ step: "Smoke test", purpose: "Locate the leak", expectedResult: "Visible smoke escape" }],
  safetyWarnings: [],
  missingInformation: [],
};

// The exact production payload shape: a tool call arrived, but two
// top-level fields never made it into it.
const TRUNCATED_OUTPUT = {
  rankedCauses: VALID_OUTPUT.rankedCauses,
  recommendedTests: VALID_OUTPUT.recommendedTests,
  missingInformation: [],
};

function message(input: unknown, stopReason: string) {
  return {
    model: "claude-sonnet-5",
    stop_reason: stopReason,
    usage: { input_tokens: 1200, output_tokens: 4096 },
    content: [{ type: "tool_use", name: "submit_diagnosis", input }],
  };
}

const INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: { vin: "1FTFW1ET1EFA00001" },
  complaint: "Check engine light",
  symptoms: [],
  modules: [],
  dtcs: [{ code: "P0171", module: "ECM", status: "current", descriptionRaw: "System too lean bank 1" }],
  systems: [],
  patterns: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: classifyDtcCategories([], []),
};

beforeEach(() => {
  const state = mockState();
  state.queue = [];
  state.calls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("output token budget", () => {
  // 4096 shared between adaptive thinking and a full report is what
  // truncated the customer's analysis. 16000 is the documented ceiling for
  // a non-streaming request, above which SDK HTTP timeouts bind instead.
  it("leaves real headroom for thinking plus the report, without exceeding the non-streaming ceiling", () => {
    expect(SCAN_REPORT_MAX_TOKENS).toBeGreaterThan(4096);
    expect(SCAN_REPORT_MAX_TOKENS).toBeLessThanOrEqual(16000);
  });
});

describe("truncated tool calls are identified as truncation, not as a schema violation", () => {
  it("names the token limit when stop_reason is max_tokens, even though a tool_use block is present", async () => {
    const state = mockState();
    // Both attempts truncate — a retry cannot fix a budget ceiling.
    state.queue = [message(TRUNCATED_OUTPUT, "max_tokens"), message(TRUNCATED_OUTPUT, "max_tokens")];

    const err = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiResponseValidationError);
    const validationError = err as AiResponseValidationError;
    expect(validationError.message).toContain("token output limit");
    // Records that the model DID call the tool — the distinction that made
    // the original report so hard to diagnose.
    expect(validationError.toolUsePresent).toBe(true);
    // Must not be misreported as the model inventing its own schema.
    expect(validationError.message).not.toContain("invalid structured output");
  });

  it("still reports a genuine schema violation as one when the turn ended normally", async () => {
    const state = mockState();
    state.queue = [message(TRUNCATED_OUTPUT, "tool_use"), message(TRUNCATED_OUTPUT, "tool_use")];

    const err = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiResponseValidationError);
    expect((err as AiResponseValidationError).message).toContain("invalid structured output");
  });
});

describe("a validation failure is retried once before the customer sees an error", () => {
  it("recovers when the second attempt returns a well-formed report", async () => {
    const state = mockState();
    state.queue = [message(TRUNCATED_OUTPUT, "tool_use"), message(VALID_OUTPUT, "tool_use")];

    const result = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);

    expect(state.calls).toBe(2);
    expect(result.output.summary).toBe(VALID_OUTPUT.summary);
  });

  it("does not retry a call that already succeeded", async () => {
    const state = mockState();
    state.queue = [message(VALID_OUTPUT, "tool_use")];

    await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);

    expect(state.calls).toBe(1);
  });

  it("gives up after one retry rather than looping", async () => {
    const state = mockState();
    state.queue = [message(TRUNCATED_OUTPUT, "tool_use"), message(TRUNCATED_OUTPUT, "tool_use")];

    await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch(() => {});

    expect(state.calls).toBe(2);
  });

  it("surfaces a non-validation failure immediately instead of burning the retry on it", async () => {
    const state = mockState();
    // The Anthropic SDK already retries transport faults internally, so a
    // second layer here would multiply its attempts rather than add one.
    state.queue = [];

    const err = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AiResponseValidationError);
    expect(state.calls).toBe(1);
  });
});
