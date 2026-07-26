// Unified AI-diagnostic usage gate shared by both AI features ("DTC
// Assistant" chat and "Scan Report Analysis"). Backed by the
// ai_diagnostic_usage ledger (one row per successfully-granted
// generation, unique on (user_id, request_id)) — see
// supabase/migrations/0016_ai_diagnostic_entitlements.sql for why that
// makes a retried request free of double-charging, and why a request that
// never succeeds never consumes a slot at all.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accessLevelForPlan,
  fullDailyLimit,
  fullMonthlyLimit,
  previewDailyLimit,
  type AiDiagnosticAccessLevel,
} from "@/lib/ai-diagnostics/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

export type { AiDiagnosticAccessLevel } from "@/lib/ai-diagnostics/entitlements";
export type AiDiagnosticFeature = "chat" | "scan_report";

function nextUtcMidnightIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function nextUtcMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

// Carries everything a route needs to build the spec's exact over-limit
// response shape ({ success: false, error: { code, message,
// basicLookupAvailable, upgradeRequired, resetAt } }) without the route
// having to re-derive any of it.
export class AiDiagnosticLimitExceededError extends Error {
  readonly basicLookupAvailable = true;

  constructor(
    readonly code: string,
    message: string,
    readonly resetAt: string,
    readonly upgradeRequired: boolean,
  ) {
    super(message);
    this.name = "AiDiagnosticLimitExceededError";
  }
}

// Atomically checks-and-records one AI diagnostic generation slot for this
// user, returning the access level (preview/full) it was granted at.
// Throws AiDiagnosticLimitExceededError if the relevant daily/monthly
// allowance is exhausted. Safe to call again with the SAME requestId after
// a failed generation — the ledger row is only ever inserted on a call
// that isn't itself a retry, so a genuinely failed attempt never consumes
// a slot and a genuine retry never double-charges.
export async function recordAiDiagnosticUsage(params: {
  userId: string;
  requestId: string;
  feature: AiDiagnosticFeature;
  plan: SubscriptionPlan;
}): Promise<AiDiagnosticAccessLevel> {
  const { userId, requestId, feature, plan } = params;
  const accessLevel = accessLevelForPlan(plan);
  const supabase = createAdminClient();

  const dailyLimit = accessLevel === "preview" ? previewDailyLimit(plan) : fullDailyLimit(plan);
  const monthlyLimit = accessLevel === "preview" ? null : fullMonthlyLimit(plan);

  const { data, error } = await supabase.rpc("record_ai_diagnostic_usage", {
    p_user_id: userId,
    p_request_id: requestId,
    p_feature: feature,
    p_access_level: accessLevel,
    p_daily_limit: dailyLimit,
    p_monthly_limit: monthlyLimit,
  });
  if (error) throw error;

  if (data === "daily_limit_exceeded") {
    if (accessLevel === "preview") {
      throw new AiDiagnosticLimitExceededError(
        "FREE_DAILY_AI_LIMIT_REACHED",
        `You have used your ${dailyLimit} free AI diagnostic previews for today.`,
        nextUtcMidnightIso(),
        true,
      );
    }
    throw new AiDiagnosticLimitExceededError(
      "DAILY_REPORT_LIMIT_REACHED",
      `You've used today's ${dailyLimit}-report daily limit for your plan. It resets at midnight UTC.`,
      nextUtcMidnightIso(),
      plan !== "workshop",
    );
  }

  if (data === "monthly_limit_exceeded") {
    // Reached only when an add-on credit wasn't available either (the RPC
    // tries one automatically before returning this — see migration 0024).
    throw new AiDiagnosticLimitExceededError(
      "MONTHLY_REPORT_LIMIT_REACHED",
      `You've used this month's ${monthlyLimit}-report allowance and any add-on report credits on your account. It resets at the start of next month, or buy an add-on pack for more right away.`,
      nextUtcMonthStartIso(),
      plan !== "workshop",
    );
  }

  // 'recorded' (new slot), 'already_recorded' (idempotent retry), and
  // 'recorded_via_addon' (monthly allowance was exhausted but an add-on
  // credit covered this one — see report_addon_balances, migration 0024)
  // all mean this generation is granted at `accessLevel`. Add-on
  // consumption isn't surfaced to the caller here; report_addon_balances
  // itself is the source of truth for how much add-on credit remains.
  return accessLevel;
}

// Releases a reservation made by recordAiDiagnosticUsage for a request
// that failed AFTER the slot was reserved but before it produced a usable
// result — e.g. the AI provider call itself errored. Deleting the ledger
// row makes the slot available again immediately; a subsequent call to
// recordAiDiagnosticUsage with the same requestId is then a fresh
// reservation, not treated as "already recorded". Safe to call for a
// requestId that was never reserved (or already released) — it's just a
// no-op delete.
export async function releaseAiDiagnosticUsage(userId: string, requestId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_diagnostic_usage")
    .delete()
    .eq("user_id", userId)
    .eq("request_id", requestId);
  if (error) throw error;
}

export interface AiDiagnosticUsageSummary {
  accessLevel: AiDiagnosticAccessLevel;
  previewsUsedToday: number;
  previewDailyLimit: number | null;
  fullReportsUsedToday: number;
  fullReportsUsedThisMonth: number;
  fullDailyLimit: number;
  fullMonthlyLimit: number;
}

// Real, current usage — used by the account page. Never a placeholder;
// reads the same counters recordAiDiagnosticUsage enforces against.
interface UsageSummaryRow {
  previews_used_today: number;
  full_reports_used_today: number;
  full_reports_used_this_month: number;
}

export async function getAiDiagnosticUsageSummary(
  userId: string,
  plan: SubscriptionPlan,
): Promise<AiDiagnosticUsageSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_ai_diagnostic_usage_summary", { p_user_id: userId });
  if (error) throw error;

  // A `returns table (...)` RPC comes back as an array of rows (there's
  // always exactly one row here, since the underlying query has no
  // GROUP BY and therefore always returns a single aggregate row).
  const row = (Array.isArray(data) ? data[0] : data) as UsageSummaryRow | undefined;

  return {
    accessLevel: accessLevelForPlan(plan),
    previewsUsedToday: row?.previews_used_today ?? 0,
    previewDailyLimit: previewDailyLimit(plan),
    fullReportsUsedToday: row?.full_reports_used_today ?? 0,
    fullReportsUsedThisMonth: row?.full_reports_used_this_month ?? 0,
    fullDailyLimit: fullDailyLimit(plan),
    fullMonthlyLimit: fullMonthlyLimit(plan),
  };
}

// Reduces the two-dimensional summary above to the single {used, limit,
// unit} shape UsageMeter already renders — free shows today's preview
// count, paid plans show this month's full-report count (the headline
// number in their pricing copy). Never a placeholder: both branches read
// real, current values from the same summary recordAiDiagnosticUsage
// enforces against.
export interface LegacyUsageSummary {
  used: number;
  limit: number;
  unit: "previews" | "reports";
}

export function toLegacyUsageSummary(summary: AiDiagnosticUsageSummary): LegacyUsageSummary {
  if (summary.accessLevel === "preview") {
    return { used: summary.previewsUsedToday, limit: summary.previewDailyLimit ?? 0, unit: "previews" };
  }
  return { used: summary.fullReportsUsedThisMonth, limit: summary.fullMonthlyLimit, unit: "reports" };
}

// The credit-weighted operation type actually performed — matches
// DIAGNOSTIC_CREDIT_WEIGHTS in src/lib/pricing.ts. Tracked for cost
// observability and (once add-on packs exist) add-on-credit consumption;
// never affects the flat report-count gate in recordAiDiagnosticUsage.
export type AiDiagnosticOperationType =
  | "standard_report"
  | "long_scanner_report"
  | "additional_reviewer"
  | "additional_language"
  | "major_regeneration"
  | "follow_up_round";

export interface AiDiagnosticRunRecord {
  userId: string;
  requestId: string;
  feature: AiDiagnosticFeature;
  plan: SubscriptionPlan;
  providerId: string;
  modelId: string;
  status: "completed" | "failed";
  accessLevelRequested: AiDiagnosticAccessLevel;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  toolCalls?: number;
  /** @deprecated superseded by estimatedTotalCostMicros (migration 0023) — kept only for legacy readers of the old numeric(10,6) column. */
  estimatedCostUsd?: number | null;
  errorMessage?: string | null;
  // Cost-ledger fields (migration 0023) — all optional so existing callers
  // that haven't been updated to compute cost yet keep working unchanged.
  diagnosticCaseId?: string | null;
  reportId?: string | null;
  operationType?: AiDiagnosticOperationType;
  creditsConsumed?: number;
  estimatedInputCostMicros?: number | null;
  estimatedOutputCostMicros?: number | null;
  estimatedTotalCostMicros?: number | null;
  latencyMs?: number | null;
}

// Internal cost/observability logging only — never read by any
// enforcement path and never exposed to customers. Best-effort: a logging
// failure here must never turn into a user-facing error, so it's caught
// and logged rather than thrown.
export async function recordAiDiagnosticRun(record: AiDiagnosticRunRecord): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ai_diagnostic_runs").insert({
    user_id: record.userId,
    request_id: record.requestId,
    feature: record.feature,
    plan: record.plan,
    provider_id: record.providerId,
    model_id: record.modelId,
    status: record.status,
    access_level_requested: record.accessLevelRequested,
    input_tokens: record.inputTokens ?? null,
    output_tokens: record.outputTokens ?? null,
    cached_tokens: record.cachedTokens ?? null,
    tool_calls: record.toolCalls ?? 0,
    estimated_cost_usd: record.estimatedCostUsd ?? null,
    error_message: record.errorMessage ?? null,
    diagnostic_case_id: record.diagnosticCaseId ?? null,
    report_id: record.reportId ?? null,
    operation_type: record.operationType ?? "standard_report",
    credits_consumed: record.creditsConsumed ?? 1,
    estimated_input_cost_micros: record.estimatedInputCostMicros ?? null,
    estimated_output_cost_micros: record.estimatedOutputCostMicros ?? null,
    estimated_total_cost_micros: record.estimatedTotalCostMicros ?? null,
    latency_ms: record.latencyMs ?? null,
  });
  if (error) console.error("[ai-diagnostics] failed to record cost/observability run", error);
}
