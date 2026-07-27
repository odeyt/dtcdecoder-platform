// Numeric/tunable configuration for the multi-model diagnostic orchestrator
// — every value has a conservative built-in default so an unset env var
// never disables a safety check by accident (missing config fails toward
// MORE review/MORE caution, never less). See docs/MULTI_MODEL_ORCHESTRATOR.md
// and docs/AI_BUDGET_GUARD.md. Kept separate from src/lib/pricing.ts because
// these are runtime env-tunable operational knobs, not the compile-time
// product/pricing registry pricing.ts is the single source of truth for.
//
// Every value below is read from process.env FRESH on each call (functions,
// not module-level consts) rather than cached at import time — this app's
// tests (and any hot-reloading dev server) rely on env changes taking
// effect without a process restart; a frozen top-level const evaluated
// once at first import would silently ignore env changes made afterward.
import "server-only";

function numberEnv(name: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const min = opts?.min ?? -Infinity;
  const max = opts?.max ?? Infinity;
  return Math.max(min, Math.min(max, parsed));
}

// undefined = "not configured" (the aggregate budget dimension is skipped
// entirely) vs. a real number — never silently coerced to 0, which would
// make every request look over-budget.
function optionalUsdEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export interface RouterThresholds {
  reviewConfidenceThreshold: number;
  humanReviewConfidenceThreshold: number;
  qualityAuditPercent: number;
  maxEscalationsPerCase: number;
}

export function getRouterThresholds(): RouterThresholds {
  return {
    // Internal confidence score (0-100, see confidence.ts) below which the
    // router requests an Anthropic review of the primary result.
    reviewConfidenceThreshold: numberEnv("AI_REVIEW_CONFIDENCE_THRESHOLD", 0.72, { min: 0, max: 1 }) * 100,
    // Below this, the router marks the case for human review regardless of
    // what the review provider concludes.
    humanReviewConfidenceThreshold: numberEnv("AI_HUMAN_REVIEW_CONFIDENCE_THRESHOLD", 0.45, { min: 0, max: 1 }) * 100,
    // % of otherwise primary-only cases randomly selected for a quality-
    // audit review, independent of confidence/safety triggers.
    qualityAuditPercent: numberEnv("AI_QUALITY_AUDIT_PERCENT", 5, { min: 0, max: 100 }),
    // Hard cap on review escalations for a single case, regardless of how
    // many trigger conditions fire — never more than one review round.
    maxEscalationsPerCase: numberEnv("AI_MAX_ESCALATIONS_PER_CASE", 1, { min: 0, max: 1 }),
  };
}

export interface RequestLimits {
  maxPrimaryInputTokens: number;
  maxPrimaryOutputTokens: number;
  maxReviewInputTokens: number;
  maxReviewOutputTokens: number;
  maxRequestsPerCase: number;
  providerTimeoutMs: number;
  providerMaxRetries: number;
}

export function getRequestLimits(): RequestLimits {
  return {
    maxPrimaryInputTokens: numberEnv("AI_MAX_PRIMARY_INPUT_TOKENS", 12_000, { min: 100 }),
    maxPrimaryOutputTokens: numberEnv("AI_MAX_PRIMARY_OUTPUT_TOKENS", 4096, { min: 100 }),
    maxReviewInputTokens: numberEnv("AI_MAX_REVIEW_INPUT_TOKENS", 8_000, { min: 100 }),
    maxReviewOutputTokens: numberEnv("AI_MAX_REVIEW_OUTPUT_TOKENS", 2048, { min: 100 }),
    // A case may consume at most one primary call and one review call —
    // never a recursive or repeated model-to-model loop.
    maxRequestsPerCase: numberEnv("AI_MAX_REQUESTS_PER_CASE", 2, { min: 1, max: 2 }),
    providerTimeoutMs: numberEnv("AI_PROVIDER_TIMEOUT_MS", 30_000, { min: 1_000, max: 120_000 }),
    // Bounded — validation/auth/quota errors never retry regardless of this
    // value (see openai-provider.ts isRetryableOpenAiError).
    providerMaxRetries: numberEnv("AI_PROVIDER_MAX_RETRIES", 1, { min: 0, max: 3 }),
  };
}

export interface BudgetLimitsUsd {
  daily?: number;
  monthly?: number;
  perCase?: number;
  perUserDaily?: number;
  perShopMonthly?: number;
}

// undefined = dimension not configured = that budget check is skipped
// (never treated as an implicit $0 ceiling). Per-shop has no distinct
// entity in this schema (see docs/MULTI_MODEL_ORCHESTRATOR.md "no
// multi-tenant shop table") — it is evaluated as an alias of the per-user
// monthly figure, never silently ignored.
export function getBudgetLimitsUsd(): BudgetLimitsUsd {
  return {
    daily: optionalUsdEnv("AI_DAILY_BUDGET_USD"),
    monthly: optionalUsdEnv("AI_MONTHLY_BUDGET_USD"),
    perCase: optionalUsdEnv("AI_PER_CASE_BUDGET_USD"),
    perUserDaily: optionalUsdEnv("AI_PER_USER_DAILY_BUDGET_USD"),
    perShopMonthly: optionalUsdEnv("AI_PER_SHOP_MONTHLY_BUDGET_USD"),
  };
}

export interface BudgetPercentThresholds {
  warning: number;
  restrict: number;
  hardStop: number;
}

export function getBudgetPercentThresholds(): BudgetPercentThresholds {
  return {
    warning: numberEnv("AI_BUDGET_WARNING_PERCENT", 75, { min: 0, max: 100 }),
    restrict: numberEnv("AI_BUDGET_RESTRICT_PERCENT", 90, { min: 0, max: 100 }),
    hardStop: numberEnv("AI_BUDGET_HARD_STOP_PERCENT", 100, { min: 0, max: 1000 }),
  };
}
