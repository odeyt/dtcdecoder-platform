import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateCostMicros, MODEL_PRICING } from "@/lib/ai-diagnostics/cost";

const ENV_KEYS = [
  "OPENAI_PRIMARY_MODEL",
  "OPENAI_FALLBACK_MODEL",
  "OPENAI_TRANSLATION_MODEL",
  "GEMINI_MULTIMODAL_MODEL",
  "OPENAI_INPUT_PER_MILLION_USD",
  "OPENAI_OUTPUT_PER_MILLION_USD",
  "GEMINI_INPUT_PER_MILLION_USD",
  "GEMINI_OUTPUT_PER_MILLION_USD",
] as const;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("cost.ts multi-provider pricing", () => {
  it("never reports $0.00 for a genuinely unrecognized model — falls back to the conservative rate, flagged as such", () => {
    const result = estimateCostMicros({ modelId: "some-unconfigured-model", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    expect(result.totalCostMicros).toBeGreaterThan(0);
    expect(result.pricingSource).toBe("unknown_model_fallback");
  });

  it("prices a configured OpenAI primary model from OPENAI_*_PER_MILLION_USD when both are set", () => {
    process.env.OPENAI_PRIMARY_MODEL = "gpt-test-primary";
    process.env.OPENAI_INPUT_PER_MILLION_USD = "2";
    process.env.OPENAI_OUTPUT_PER_MILLION_USD = "8";

    const result = estimateCostMicros({ modelId: "gpt-test-primary", estimatedInputTokens: 1_000_000, estimatedOutputTokens: 1_000_000 });
    expect(result.pricingSource).toBe("env_override");
    expect(result.inputCostMicros).toBe(2_000_000);
    expect(result.outputCostMicros).toBe(8_000_000);
  });

  it("falls back to the unknown-model rate for a configured OpenAI model when its env price isn't set", () => {
    process.env.OPENAI_PRIMARY_MODEL = "gpt-test-primary";
    // No OPENAI_INPUT_PER_MILLION_USD/OPENAI_OUTPUT_PER_MILLION_USD set.
    const result = estimateCostMicros({ modelId: "gpt-test-primary", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    expect(result.pricingSource).toBe("unknown_model_fallback");
    expect(result.totalCostMicros).toBeGreaterThan(0);
  });

  it("prices a configured Gemini model from GEMINI_*_PER_MILLION_USD when both are set", () => {
    process.env.GEMINI_MULTIMODAL_MODEL = "gemini-test-model";
    process.env.GEMINI_INPUT_PER_MILLION_USD = "1";
    process.env.GEMINI_OUTPUT_PER_MILLION_USD = "4";

    const result = estimateCostMicros({ modelId: "gemini-test-model", estimatedInputTokens: 1_000_000, estimatedOutputTokens: 1_000_000 });
    expect(result.pricingSource).toBe("env_override");
    expect(result.inputCostMicros).toBe(1_000_000);
    expect(result.outputCostMicros).toBe(4_000_000);
  });

  it("prices a configured OpenAI translation-tier model from OPENAI_*_PER_MILLION_USD when both are set", () => {
    process.env.OPENAI_TRANSLATION_MODEL = "gpt-test-economical";
    process.env.OPENAI_INPUT_PER_MILLION_USD = "1";
    process.env.OPENAI_OUTPUT_PER_MILLION_USD = "5";

    const result = estimateCostMicros({
      modelId: "gpt-test-economical",
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 1_000_000,
    });
    expect(result.pricingSource).toBe("env_override");
    expect(result.inputCostMicros).toBe(1_000_000);
    expect(result.outputCostMicros).toBe(5_000_000);
  });

  it("MODEL_PRICING has no hardcoded entries — every OpenAI model is priced via env override or the unknown-model fallback", () => {
    expect(Object.keys(MODEL_PRICING)).toHaveLength(0);
  });
});
