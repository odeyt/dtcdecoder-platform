import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

vi.mock("@/lib/scan-diagnostics/dtc-grounding", () => ({
  findKnownDtcContext: async () => new Map(),
}));

vi.mock("openai", () => {
  const state: { parseImpl: (...args: unknown[]) => unknown } = {
    parseImpl: async () => {
      throw new Error("not configured for this test");
    },
  };
  (globalThis as Record<string, unknown>).__openaiMockState = state;

  class FakeAPIError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }

  class FakeOpenAI {
    chat = { completions: { parse: (...args: unknown[]) => state.parseImpl(...args) } };
    constructor(_opts: unknown) {}
    static APIError = FakeAPIError;
  }

  return { default: FakeOpenAI };
});

const { OpenAiDiagnosticProvider, OpenAiConfigurationError } = await import(
  "@/lib/scan-diagnostics/ai/openai-provider"
);

function mockState() {
  return (globalThis as Record<string, unknown>).__openaiMockState as { parseImpl: (...args: unknown[]) => unknown };
}

// The mocked "openai" module's APIError constructor is (message, status) —
// deliberately simpler than the real SDK's 4-arg APIError.generate() shape,
// since this test only needs a `status`-bearing, instanceof-matching error
// object. Cast rather than fight the real package's .d.ts typing here.
async function makeApiError(message: string, status: number): Promise<Error> {
  const OpenAI = (await import("openai")).default;
  const Ctor = OpenAI.APIError as unknown as new (message: string, status?: number) => Error;
  return new Ctor(message, status);
}

function validCompletion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    model: "gpt-test-primary",
    _request_id: "req_123",
    usage: { prompt_tokens: 100, completion_tokens: 200 },
    choices: [
      {
        message: {
          parsed: {
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
          },
          refusal: null,
        },
      },
    ],
    ...overrides,
  };
}

const INPUT: CanonicalDiagnosticInput = {
  caseId: "case-1",
  vehicle: { vin: "1FTFW1ET1EFA00001" },
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

const ENV_KEYS = ["OPENAI_API_KEY", "OPENAI_PRIMARY_MODEL", "OPENAI_FALLBACK_MODEL"] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_PRIMARY_MODEL = "gpt-test-primary";
  delete process.env.OPENAI_FALLBACK_MODEL;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("OpenAiDiagnosticProvider", () => {
  it("returns a DiagnosticAIProviderResult-shaped result on a successful structured parse", async () => {
    mockState().parseImpl = async () => validCompletion();
    const provider = new OpenAiDiagnosticProvider();
    const result = await provider.runDiagnosis(INPUT);

    expect(result.providerId).toBe("openai-primary");
    expect(result.modelId).toBe("gpt-test-primary");
    expect(result.output.rankedCauses).toHaveLength(1);
    expect(result.tokens).toEqual({ input: 100, output: 200 });
  });

  it("throws AiResponseValidationError when the model refuses instead of returning parsed output", async () => {
    mockState().parseImpl = async () =>
      validCompletion({ choices: [{ message: { parsed: null, refusal: "cannot help with this" } }] });
    const provider = new OpenAiDiagnosticProvider();
    await expect(provider.runDiagnosis(INPUT)).rejects.toThrow(/refused/i);
  });

  it("throws OpenAiConfigurationError when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const provider = new OpenAiDiagnosticProvider();
    await expect(provider.runDiagnosis(INPUT)).rejects.toBeInstanceOf(OpenAiConfigurationError);
  });

  it("retries once with OPENAI_FALLBACK_MODEL after a transient (5xx) primary-model failure", async () => {
    process.env.OPENAI_FALLBACK_MODEL = "gpt-test-fallback";
    let callCount = 0;
    mockState().parseImpl = async () => {
      callCount += 1;
      if (callCount === 1) {
        throw await makeApiError("server error", 500);
      }
      return validCompletion({ model: "gpt-test-fallback" });
    };

    const provider = new OpenAiDiagnosticProvider();
    const result = await provider.runDiagnosis(INPUT);
    expect(result.modelId).toBe("gpt-test-fallback");
    expect(callCount).toBe(2);
  });

  it("does NOT retry with the fallback model after a deterministic client error (400)", async () => {
    process.env.OPENAI_FALLBACK_MODEL = "gpt-test-fallback";
    let callCount = 0;
    mockState().parseImpl = async () => {
      callCount += 1;
      throw await makeApiError("bad request", 400);
    };

    const provider = new OpenAiDiagnosticProvider();
    await expect(provider.runDiagnosis(INPUT)).rejects.toThrow();
    expect(callCount).toBe(1);
  });
});
