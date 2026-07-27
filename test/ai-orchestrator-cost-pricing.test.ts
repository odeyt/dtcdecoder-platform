import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateCostMicros } from "@/lib/ai-diagnostics/cost";

const ENV_KEYS = [
  "OPENAI_PRIMARY_MODEL",
  "OPENAI_FALLBACK_MODEL",
  "GEMINI_MULTIMODAL_MODEL",
  "OPENAI_INPUT_PER_MILLION_USD",
  "OPENAI_OUTPUT_PER_MILLION_USD",
  "GEMINI_INPUT_PER_MILLION_USD",
  "GEMINI_OUTPUT_PER_MILLION_USD",
  "ANTHROPIC_INPUT_PER_MILLION_USD",
  "ANTHROPIC_OUTPUT_PER_MILLION_USD",
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

  it("ANTHROPIC_*_PER_MILLION_USD overrides only claude-sonnet-5's rate, not claude-haiku-4-5's", () => {
    process.env.ANTHROPIC_INPUT_PER_MILLION_USD = "10";
    process.env.ANTHROPIC_OUTPUT_PER_MILLION_USD = "50";

    const sonnet = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 1_000_000, estimatedOutputTokens: 0 });
    expect(sonnet.pricingSource).toBe("env_override");
    expect(sonnet.inputCostMicros).toBe(10_000_000);

    const haiku = estimateCostMicros({ modelId: "claude-haiku-4-5", estimatedInputTokens: 1_000_000, estimatedOutputTokens: 0 });
    expect(haiku.pricingSource).toBe("manual_config");
    expect(haiku.inputCostMicros).toBe(1_000_000); // unchanged $1/million rate
  });

  it("a known model with no env override reports pricingSource 'manual_config'", () => {
    const result = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    expect(result.pricingSource).toBe("manual_config");
  });
});
