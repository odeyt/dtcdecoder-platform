import { describe, expect, it } from "vitest";
import {
  estimateCostMicros,
  computeActualCostMicros,
  guardCostCeiling,
  isOverWarningThreshold,
  CostCeilingExceededError,
  microsToUsd,
  MODEL_PRICING,
} from "@/lib/ai-diagnostics/cost";

describe("estimateCostMicros / computeActualCostMicros", () => {
  it("computes cost from a known model's per-million-token rate", () => {
    const rate = MODEL_PRICING["claude-sonnet-5"];
    const result = estimateCostMicros({
      modelId: "claude-sonnet-5",
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 1_000_000,
    });
    expect(result.inputCostMicros).toBe(rate.inputUsdPerMillionTokens * 1_000_000);
    expect(result.outputCostMicros).toBe(rate.outputUsdPerMillionTokens * 1_000_000);
    expect(result.totalCostMicros).toBe(result.inputCostMicros + result.outputCostMicros);
  });

  it("scales linearly with token count", () => {
    const small = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 1000, estimatedOutputTokens: 0 });
    const large = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 10000, estimatedOutputTokens: 0 });
    expect(large.inputCostMicros).toBe(small.inputCostMicros * 10);
  });

  it("falls back to the (deliberately expensive) fallback rate for an unrecognized model id", () => {
    const known = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    const unknown = estimateCostMicros({ modelId: "some-future-model", estimatedInputTokens: 1000, estimatedOutputTokens: 1000 });
    // Overestimating on an unrecognized model is the safe failure direction
    // (more likely to trip the ceiling guard than to silently undercharge).
    expect(unknown.totalCostMicros).toBeGreaterThan(known.totalCostMicros);
  });

  it("computeActualCostMicros folds cached input tokens into the input rate, never treats them as free", () => {
    const withoutCache = computeActualCostMicros({ modelId: "claude-sonnet-5", inputTokens: 1000, outputTokens: 0 });
    const withCache = computeActualCostMicros({
      modelId: "claude-sonnet-5",
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
    const cheap = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 100, estimatedOutputTokens: 100 });
    expect(() => guardCostCeiling(cheap)).not.toThrow();
  });

  it("throws CostCeilingExceededError for an estimate over the hard ceiling ($1.50)", () => {
    // A deliberately huge token count guarantees the estimate blows past
    // any reasonable ceiling regardless of the exact configured rate.
    const huge = estimateCostMicros({
      modelId: "claude-sonnet-5",
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
    const cheap = estimateCostMicros({ modelId: "claude-sonnet-5", estimatedInputTokens: 100, estimatedOutputTokens: 100 });
    expect(isOverWarningThreshold(cheap)).toBe(false);

    const overWarning = estimateCostMicros({
      modelId: "claude-sonnet-5",
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 0,
    });
    expect(isOverWarningThreshold(overWarning)).toBe(true);
  });
});
