import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import type { CanonicalDiagnosticInput } from "@/lib/scan-diagnostics/schemas";

// Strict tool use is the structural fix for the production incident where
// the model returned a tool call missing `summary` and `safetyWarnings`:
// with `strict: true` the API guarantees `tool_use.input` matches the
// schema, rather than the model merely being asked to comply.
//
// The schema-shape assertions below matter because strict mode has real
// eligibility rules — a schema that violates them is rejected at request
// time, which would break every diagnosis. They encode those rules so a
// future edit to the tool can't quietly disqualify it.

vi.mock("@/lib/scan-diagnostics/dtc-grounding", () => ({
  findKnownDtcContext: async () => new Map(),
}));
vi.mock("@/lib/env", () => ({ env: { anthropicApiKey: () => "test-key" } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}));

// Only the parts of the outgoing request these assertions inspect.
type CapturedRequest = {
  tools: Array<{ strict?: boolean; input_schema: unknown }>;
};
type MockState = { queue: unknown[]; requests: CapturedRequest[] };

vi.mock("@anthropic-ai/sdk", () => {
  const state: MockState = { queue: [], requests: [] };
  (globalThis as Record<string, unknown>).__anthropicStrictState = state;

  class FakeAPIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  class FakeAnthropic {
    messages = {
      create: async (params: unknown) => {
        state.requests.push(params as CapturedRequest);
        const next = state.queue.shift();
        if (next instanceof Error) throw next;
        if (!next) throw new Error("no queued response");
        return next;
      },
    };
    constructor(_o: unknown) {}
    static APIError = FakeAPIError;
  }
  return { default: FakeAnthropic };
});

const { AnthropicDiagnosticProvider } = await import("@/lib/scan-diagnostics/ai/anthropic-provider");

function st() {
  return (globalThis as Record<string, unknown>).__anthropicStrictState as MockState;
}

async function apiError(status: number, message: string) {
  const A = (await import("@anthropic-ai/sdk")).default as unknown as {
    APIError: new (s: number, m: string) => Error;
  };
  return new A.APIError(status, message);
}

const VALID = {
  summary: "Likely an intake leak.",
  rankedCauses: [
    {
      cause: "Vacuum leak",
      confidenceLevel: "medium",
      rationale: "Lean bank-1 with no trim correction.",
      supportingEvidence: ["P0171 current"],
      contradictingEvidence: [],
      confirmationTestsRequired: ["Smoke test"],
    },
  ],
  recommendedTests: [{ step: "Smoke test", purpose: "Find leak", expectedResult: "Smoke escapes" }],
  safetyWarnings: [],
  missingInformation: [],
};

const message = (input: unknown) => ({
  model: "claude-sonnet-5",
  stop_reason: "tool_use",
  usage: { input_tokens: 100, output_tokens: 900 },
  content: [{ type: "tool_use", name: "submit_diagnosis", input }],
});

const INPUT: CanonicalDiagnosticInput = {
  caseId: "c1",
  vehicle: { vin: "1FTFW1ET1EFA00001" },
  complaint: "CEL",
  symptoms: [],
  modules: [],
  dtcs: [{ code: "P0171", module: "ECM", status: "current", descriptionRaw: "Lean bank 1" }],
  systems: [],
  patterns: [],
  freezeFrame: [],
  liveData: [],
  imageOnlyPdf: false,
  extractionWarnings: [],
  dtcCategoryClassification: classifyDtcCategories([], []),
};

beforeEach(() => {
  const s = st();
  s.queue = [];
  s.requests = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("submit_diagnosis is sent as a strict tool", () => {
  it("marks the tool strict so the API enforces the schema", async () => {
    st().queue = [message(VALID)];
    await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);
    expect(st().requests[0].tools[0].strict).toBe(true);
  });

  it("declares additionalProperties:false on every object, as strict mode requires", () => {
    const walk = (node: unknown, path = "root"): string[] => {
      const bad: string[] = [];
      if (!node || typeof node !== "object") return bad;
      const obj = node as Record<string, unknown>;
      if (obj.type === "object") {
        if (obj.additionalProperties !== false) bad.push(`${path}: missing additionalProperties:false`);
        const props = Object.keys((obj.properties as Record<string, unknown>) ?? {});
        const required = (obj.required as string[]) ?? [];
        for (const p of props) if (!required.includes(p)) bad.push(`${path}.${p}: not in required`);
      }
      for (const [k, v] of Object.entries(obj)) bad.push(...walk(v, `${path}.${k}`));
      return bad;
    };
    // Rebuilt from the request the provider actually sends, so this tracks
    // the real tool definition rather than a copy that could drift.
    return (async () => {
      st().queue = [message(VALID)];
      await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);
      expect(walk(st().requests[0].tools[0].input_schema)).toEqual([]);
    })();
  });

  it("carries no array constraints, which strict mode does not support", async () => {
    st().queue = [message(VALID)];
    await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);
    const json = JSON.stringify(st().requests[0].tools[0].input_schema);
    expect(json).not.toContain("minItems");
    expect(json).not.toContain("maxItems");
  });
});

describe("a strict-schema rejection degrades instead of breaking every diagnosis", () => {
  it("retries the same call without strict when the API rejects the schema", async () => {
    st().queue = [await apiError(400, "tools.0.strict: schema is not eligible for strict mode"), message(VALID)];

    const result = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT);

    expect(result.output.summary).toBe(VALID.summary);
    expect(st().requests).toHaveLength(2);
    expect(st().requests[0].tools[0].strict).toBe(true);
    // The retry must be the same tool minus the guarantee — not a
    // different, weaker schema.
    expect(st().requests[1].tools[0].strict).toBeUndefined();
    expect(st().requests[1].tools[0].input_schema).toEqual(st().requests[0].tools[0].input_schema);
  });

  it("does not swallow an unrelated 400", async () => {
    st().queue = [await apiError(400, "messages.0: content must be non-empty")];
    const err = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("content must be non-empty");
    expect(st().requests).toHaveLength(1);
  });

  it("does not swallow auth or rate-limit failures", async () => {
    st().queue = [await apiError(401, "invalid x-api-key")];
    const err = await new AnthropicDiagnosticProvider().runDiagnosis(INPUT).catch((e: unknown) => e);
    expect((err as Error).message).toContain("invalid x-api-key");
    expect(st().requests).toHaveLength(1);
  });
});
