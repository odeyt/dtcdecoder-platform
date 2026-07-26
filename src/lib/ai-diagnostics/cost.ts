// Pre-flight cost estimation and post-hoc actual-cost computation for the
// AI cost ledger (ai_diagnostic_runs — migration 0023). Every dollar
// figure here is stored/returned in integer USD micro-units (1 USD =
// 1_000_000 micros) per the "decimal-safe monetary storage" requirement in
// docs/PRICING_AND_AI_COST_AUDIT.md §6.4 — never a float dollar amount.
import "server-only";
import { COST_GUARDS } from "@/lib/pricing";

const MICROS_PER_USD = 1_000_000;

// $/million-token rates for each model this app calls, in USD micro-units
// per token (i.e. already divided by 1,000,000 tokens AND multiplied back
// up by MICROS_PER_USD — see the literal computation below so the source
// number is the human-readable $/million-token rate, not a pre-divided
// magic constant).
//
// IMPORTANT: these rates are estimates carried over from the Claude Sonnet
// family's known pricing tier at the time this file was written, NOT
// pulled from a live Anthropic pricing API (none exists) or confirmed
// against the current Anthropic pricing page for "claude-sonnet-5"
// specifically. Verify against https://www.anthropic.com/pricing before
// treating any cost/margin number derived from this table as accurate —
// per the task's own instruction, "Do not claim margins are verified
// until real production usage data exists." Update this table (and note
// the date/source) whenever real pricing is confirmed.
interface ModelRate {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export const MODEL_PRICING: Record<string, ModelRate> = {
  "claude-sonnet-5": { inputUsdPerMillionTokens: 3, outputUsdPerMillionTokens: 15 },
};

// Fallback rate for any model id not yet in MODEL_PRICING — deliberately
// the most expensive known rate, so a missing pricing entry fails toward
// overestimating cost (and tripping the hard ceiling) rather than silently
// underestimating it.
const FALLBACK_RATE: ModelRate = { inputUsdPerMillionTokens: 15, outputUsdPerMillionTokens: 75 };

function rateFor(modelId: string): ModelRate {
  return MODEL_PRICING[modelId] ?? FALLBACK_RATE;
}

function usdPerMillionToMicrosPerToken(usdPerMillion: number): number {
  return (usdPerMillion * MICROS_PER_USD) / 1_000_000;
}

export interface CostMicros {
  inputCostMicros: number;
  outputCostMicros: number;
  totalCostMicros: number;
}

function costFromTokens(modelId: string, inputTokens: number, outputTokens: number): CostMicros {
  const rate = rateFor(modelId);
  const inputCostMicros = Math.round(inputTokens * usdPerMillionToMicrosPerToken(rate.inputUsdPerMillionTokens));
  const outputCostMicros = Math.round(outputTokens * usdPerMillionToMicrosPerToken(rate.outputUsdPerMillionTokens));
  return { inputCostMicros, outputCostMicros, totalCostMicros: inputCostMicros + outputCostMicros };
}

// Pre-flight estimate, before the AI provider is ever called. Callers pass
// a conservative (worst-case) expected output token count — typically the
// operation's configured max_tokens — since the actual output length isn't
// known yet; this makes the estimate a ceiling, not an average.
export function estimateCostMicros(params: {
  modelId: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}): CostMicros {
  return costFromTokens(params.modelId, params.estimatedInputTokens, params.estimatedOutputTokens);
}

// Actual cost after a completed generation, from the provider's real
// reported token usage. Cached input tokens are billed at the same input
// rate here (Anthropic's prompt-caching discount is not modeled per-token
// in this table yet — see MODEL_PRICING's verification note) rather than
// silently treated as free, so a real cache-discount rollout doesn't
// invisibly make this estimate look worse than the eventual real bill.
export function computeActualCostMicros(params: {
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}): CostMicros {
  const totalInputTokens = params.inputTokens + (params.cachedTokens ?? 0);
  return costFromTokens(params.modelId, totalInputTokens, params.outputTokens);
}

export function microsToUsd(micros: number): number {
  return micros / MICROS_PER_USD;
}

// Thrown by guardCostCeiling when a pre-flight estimate exceeds
// COST_GUARDS.hardCeilingUsd — the request must be rejected before the AI
// provider is called, never merely logged after the fact.
export class CostCeilingExceededError extends Error {
  constructor(
    readonly estimatedCostMicros: number,
    readonly hardCeilingMicros: number,
  ) {
    super(
      `Estimated cost $${microsToUsd(estimatedCostMicros).toFixed(4)} exceeds the hard ceiling of $${microsToUsd(hardCeilingMicros).toFixed(2)}.`,
    );
    this.name = "CostCeilingExceededError";
  }
}

// Step 3-4 of the estimate -> confirm quota -> reserve -> reject-if-over-
// ceiling pipeline (docs/PRICING_AND_AI_COST_AUDIT.md's required pipeline)
// — called AFTER recordAiDiagnosticUsage has reserved the report-count
// slot but BEFORE the AI provider is invoked. Throwing here still leaves
// the slot reserved; callers are responsible for releasing it (the same
// releaseAiDiagnosticUsage path already used for a provider failure) so a
// ceiling-rejected request never consumes a report allowance either.
export function guardCostCeiling(estimate: CostMicros): void {
  const hardCeilingMicros = Math.round(COST_GUARDS.hardCeilingUsd * MICROS_PER_USD);
  if (estimate.totalCostMicros > hardCeilingMicros) {
    throw new CostCeilingExceededError(estimate.totalCostMicros, hardCeilingMicros);
  }
}

export function isOverWarningThreshold(estimate: CostMicros): boolean {
  const warningMicros = Math.round(COST_GUARDS.warningThresholdUsd * MICROS_PER_USD);
  return estimate.totalCostMicros > warningMicros;
}
