import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  estimateCostMicros,
  computeActualCostMicros,
  guardCostCeiling,
  isOverWarningThreshold,
  CostCeilingExceededError,
  microsToUsd,
} from "@/lib/ai-diagnostics/cost";

// No model is hardcoded in MODEL_PRICING (see cost.ts) — the only way to
// get a "configured/known" rate is via OPENAI_PRIMARY_MODEL +
// OPENAI_*_PER_MILLION_USD env override, so these tests set that up
// themselves rather than relying on a static table entry.
const ENV_KEYS = ["OPENAI_PRIMARY_MODEL", "OPENAI_INPUT_PER_MILLION_USD", "OPENAI_OUTPUT_PER_MILLION_USD"] as const;
const originalEnv: Record<string, string | undefined> = {};
const MODEL_ID = "gpt-test-known";

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.OPENAI_PRIMARY_MODEL = MODEL_ID;
  process.env.OPENAI_INPUT_PER_MILLION_USD = "3";
  process.env.OPENAI_OUTPUT_PER_MILLION_USD = "15";
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

describe("estimateCostMicros / computeActualCostMicros", () => {
  it("computes cost from a configured model's env-override per-million-token rate", () => {
    const result = estimateCostMicros({
      modelId: MODEL_ID,
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 1_000_000,
    });
    expect(result.pricingSource).toBe("env_override");
    expect(result.inputCostMicros).toBe(3_000_000);
    expect(result.outputCostMicros).toBe(15_000_000);
    expect(result.totalCostMicros).toBe(result.inputCostMicros + result.outputCostMicros);
  });

  it("scales linearly with token count", () => {
    const small = estimateCostMicros({ modelId: MODEL_ID, estimatedInputTokens: 1000, estimatedOutputTokens: 0 });
    const large = estimateCostMicros({ modelId: MODEL_ID, estimatedInputTokens: 10000, estimatedOutputTokens: 0 });
    expect(large.inputCostMicros).toBe(small.inputCostMicros * 10);
  });

  it("falls back to the (deliberately expensive) fallback rate for an unrecognized model id", () => {
    const known = estimateCostMicros({ modelId: MODEL_ID, estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    const unknown = estimateCostMicros({ modelId: "some-future-model", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    expect(unknown.pricingSource).toBe("unknown_model_fallback");
    // Overestimating on an unrecognized model is the safe failure direction
    // (more likely to trip the ceiling guard than to silently undercharge).
    expect(unknown.totalCostMicros).toBeGreaterThan(known.totalCostMicros);
  });

  it("computeActualCostMicros folds cached input tokens into the input rate, never treats them as free", () => {
    const withoutCache = computeActualCostMicros({ modelId: MODEL_ID, inputTokens: 1000, outputTokens: 0 });
    const withCache = computeActualCostMicros({
      modelId: MODEL_ID,
      inputTokens: 1000,
      outputTokens: 0,
      cachedTokens: 500,
    });
    expect(withCache.inputCostMicros).toBeGreaterThan(withoutCache.inputCostMicros);
  });

  it("microsToUsd converts back to a human-readable dollar amount", () => {
    expect(microsToUsd(1_000_000)).toBe(1);
    expect(microsToUsd(500_000)).toBe(0.5);
  });
});

describe("guardCostCeiling", () => {
  it("does not throw for an estimate under COST_GUARDS.hardCeilingUsd", () => {
    const cheap = estimateCostMicros({ modelId: MODEL_ID, estimatedInputTokens: 100, estimatedOutputTokens: 100 });
    expect(() => guardCostCeiling(cheap)).not.toThrow();
  });

  it("throws CostCeilingExceededError for an estimate over the hard ceiling ($1.50)", () => {
    // A deliberately huge token count guarantees the estimate blows past
    // any reasonable ceiling regardless of the exact configured rate.
    const huge = estimateCostMicros({
      modelId: MODEL_ID,
      estimatedInputTokens: 10_000_000,
      estimatedOutputTokens: 10_000_000,
    });
    try {
      guardCostCeiling(huge);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(CostCeilingExceededError);
      const typed = err as CostCeilingExceededError;
      expect(typed.estimatedCostMicros).toBe(huge.totalCostMicros);
      expect(typed.hardCeilingMicros).toBe(1_500_000);
    }
  });
});

describe("isOverWarningThreshold", () => {
  it("is false under the $0.75 warning threshold and true over it", () => {
    const cheap = estimateCostMicros({ modelId: MODEL_ID, estimatedInputTokens: 100, estimatedOutputTokens: 100 });
    expect(isOverWarningThreshold(cheap)).toBe(false);

    const overWarning = estimateCostMicros({
      modelId: MODEL_ID,
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 0,
    });
    expect(isOverWarningThreshold(overWarning)).toBe(true);
  });
});
