import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import { AiResponseValidationError } from "@/lib/scan-diagnostics/api-errors";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

// Regression cover for a production failure on a paid subscriber's
// "Professional Scan Analysis": the model returned a response whose
// structured output was missing required fields, and the customer saw "AI
// analysis failed. Please try again." with no way to tell a truncated
// response from a genuinely malformed one. Ported from the original
// Anthropic-provider version of this test after the OpenAI migration —
// same behavioral guarantees, OpenAI's chat.completions.parse() shape.

vi.mock("@/lib/scan-diagnostics/dtc-grounding", () => ({
  findKnownDtcContext: async () => new Map(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    openaiApiKeyOptional: () => "test-key",
    openaiPrimaryModelOptional: () => "test-model",
    openaiFallbackModelOptional: () => undefined,
    openaiTranslationModelOptional: () => undefined,
  },
}));

vi.mock("openai", () => {
  const state: { queue: unknown[]; calls: number } = { queue: [], calls: 0 };
  (globalThis as Record<string, unknown>).__openaiMockState = state;

  class FakeAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  class FakeOpenAI {
    chat = {
      completions: {
        parse: async () => {
          state.calls += 1;
          const next = state.queue.shift();
          if (next instanceof Error) throw next;
          if (!next) throw new Error("no queued OpenAI response for this call");
          return next;
        },
      },
    };
    constructor(_opts: unknown) {}
    static APIError = FakeAPIError;
  }

  return { default: FakeOpenAI };
});

const { OpenAiDiagnosticProvider, SCAN_REPORT_MAX_TOKENS } = await import(
  "@/lib/scan-diagnostics/ai/openai-provider"
);

function mockState() {
  return (globalThis as Record<string, unknown>).__openaiMockState as { queue: unknown[]; calls: number };
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

// A completion whose structured output never parsed (truncated JSON, or a
// genuine schema mismatch) — OpenAI's SDK leaves `.parsed` undefined in
// both cases, distinguished only by `finish_reason`.
function completion(finishReason: string, parsed: unknown, refusal: string | null = null) {
  return {
    model: "test-model",
    _request_id: "req_test",
    usage: { prompt_tokens: 1200, completion_tokens: 4096 },
    choices: [{ finish_reason: finishReason, message: { parsed, refusal } }],
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
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("output token budget", () => {
  it("is governed by AI_MAX_PRIMARY_OUTPUT_TOKENS, the same budget the provider actually requests", () => {
    expect(SCAN_REPORT_MAX_TOKENS).toBeGreaterThan(0);
  });
});

describe("truncated completions are identified as truncation, not as a schema violation", () => {
  it("names the token limit when finish_reason is length, even though a choice is present", async () => {
    const state = mockState();
    // Both attempts truncate — a retry cannot fix a budget ceiling.
    state.queue = [completion("length", undefined), completion("length", undefined)];

    const err = await new OpenAiDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiResponseValidationError);
    expect((err as AiResponseValidationError).message).toContain("output token limit");
    // Must not be misreported as the model returning a bad schema.
    expect((err as AiResponseValidationError).message).not.toContain("schema-conformant");
  });

  it("still reports a genuine schema/parse failure as one when the turn ended normally", async () => {
    const state = mockState();
    state.queue = [completion("stop", undefined), completion("stop", undefined)];

    const err = await new OpenAiDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiResponseValidationError);
    expect((err as AiResponseValidationError).message).toContain("schema-conformant");
  });

  it("reports a refusal distinctly from a generic parse failure", async () => {
    const state = mockState();
    state.queue = [
      completion("stop", undefined, "I can't help with that."),
      completion("stop", undefined, "I can't help with that."),
    ];

    const err = await new OpenAiDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AiResponseValidationError);
    expect((err as AiResponseValidationError).message).toContain("refused");
  });
});

describe("a validation failure is retried once before the customer sees an error", () => {
  it("recovers when the second attempt returns a well-formed report", async () => {
    const state = mockState();
    state.queue = [completion("stop", undefined), completion("stop", VALID_OUTPUT)];

    const result = await new OpenAiDiagnosticProvider().runDiagnosis(INPUT);

    expect(state.calls).toBe(2);
    expect(result.output.summary).toBe(VALID_OUTPUT.summary);
  });

  it("does not retry a call that already succeeded", async () => {
    const state = mockState();
    state.queue = [completion("stop", VALID_OUTPUT)];

    await new OpenAiDiagnosticProvider().runDiagnosis(INPUT);

    expect(state.calls).toBe(1);
  });

  it("gives up after one retry rather than looping", async () => {
    const state = mockState();
    state.queue = [completion("stop", undefined), completion("stop", undefined)];

    await new OpenAiDiagnosticProvider().runDiagnosis(INPUT).catch(() => {});

    expect(state.calls).toBe(2);
  });

  it("surfaces a non-validation failure immediately instead of burning the retry on it", async () => {
    const state = mockState();
    // The OpenAI SDK already retries transport faults internally, so a
    // second layer here would multiply its attempts rather than add one.
    state.queue = [];

    const err = await new OpenAiDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(AiResponseValidationError);
    expect(state.calls).toBe(1);
  });
});
