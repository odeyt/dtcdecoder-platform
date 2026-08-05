// Phase 2.1 turn-shaped usage ledger (migration 0032). Mirrors
// ai-diagnostics/usage.ts's reserve-before-call / release-on-failure shape
// for consistency with every other AI-calling feature in this app, backed
// by its own diagnostic_engine_usage table so counts never cross-
// contaminate with the report-shaped ai_diagnostic_usage ledger (see the
// migration's header comment for why sharing that table/RPC would have
// been wrong).
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDiagnosticEngineAccess, type DiagnosticEngineFeatureKey } from "@/lib/diagnostic-engine/entitlements";
import type { SubscriptionPlan } from "@/lib/types";

function nextUtcMidnightIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function nextUtcMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

export class DiagnosticEngineLimitExceededError extends Error {
  readonly upgradeRequired: boolean;

  constructor(
    readonly code: "DIAGNOSTIC_ENGINE_DAILY_LIMIT_REACHED" | "DIAGNOSTIC_ENGINE_MONTHLY_LIMIT_REACHED",
    message: string,
    readonly resetAt: string,
    upgradeRequired: boolean,
    readonly limit: number,
  ) {
    super(message);
    this.name = "DiagnosticEngineLimitExceededError";
    this.upgradeRequired = upgradeRequired;
  }
}

export interface RecordDiagnosticEngineUsageParams {
  userId: string;
  email: string | null;
  requestId: string;
  feature: DiagnosticEngineFeatureKey;
  plan: SubscriptionPlan;
}

// Atomically checks-and-records one Diagnostic Engine usage slot. Throws
// DiagnosticEngineLimitExceededError if the caller's daily/monthly
// allowance for this feature is exhausted — callers must call this BEFORE
// invoking the AI provider and call releaseDiagnosticEngineUsage if the
// subsequent call fails, so a failed attempt never consumes a slot (same
// guarantee as ai-diagnostics/usage.ts, same mechanism).
export async function recordDiagnosticEngineUsage(params: RecordDiagnosticEngineUsageParams): Promise<void> {
  const access = resolveDiagnosticEngineAccess(params.email, params.plan);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("record_diagnostic_engine_usage", {
    p_user_id: params.userId,
    p_request_id: params.requestId,
    p_feature: params.feature,
    p_plan: params.plan,
    p_access_level: access.accessLevel,
    p_daily_limit: access.limits.dailyLimit,
    p_monthly_limit: access.limits.monthlyLimit,
  });
  if (error) throw error;

  if (data === "daily_limit_exceeded") {
    throw new DiagnosticEngineLimitExceededError(
      "DIAGNOSTIC_ENGINE_DAILY_LIMIT_REACHED",
      `You've used today's ${access.limits.dailyLimit}-turn daily limit for this feature. It resets at midnight UTC.`,
      nextUtcMidnightIso(),
      params.plan !== "workshop",
      access.limits.dailyLimit ?? 0,
    );
  }
  if (data === "monthly_limit_exceeded") {
    throw new DiagnosticEngineLimitExceededError(
      "DIAGNOSTIC_ENGINE_MONTHLY_LIMIT_REACHED",
      `You've used this month's ${access.limits.monthlyLimit}-turn allowance for this feature. It resets at the start of next month.`,
      nextUtcMonthStartIso(),
      params.plan !== "workshop",
      access.limits.monthlyLimit ?? 0,
    );
  }
  // 'recorded' / 'already_recorded' both mean this call is granted.
}

export async function releaseDiagnosticEngineUsage(userId: string, requestId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("diagnostic_engine_usage")
    .delete()
    .eq("user_id", userId)
    .eq("request_id", requestId);
  if (error) throw error;
}

export interface DiagnosticEngineUsageSummary {
  usedToday: number;
  usedThisMonth: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

export async function getDiagnosticEngineUsageSummary(
  userId: string,
  email: string | null,
  plan: SubscriptionPlan,
  feature: DiagnosticEngineFeatureKey,
): Promise<DiagnosticEngineUsageSummary> {
  const access = resolveDiagnosticEngineAccess(email, plan);
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("get_diagnostic_engine_usage_summary", {
    p_user_id: userId,
    p_feature: feature,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as { used_today: number; used_this_month: number } | undefined;

  return {
    usedToday: row?.used_today ?? 0,
    usedThisMonth: row?.used_this_month ?? 0,
    dailyLimit: access.limits.dailyLimit,
    monthlyLimit: access.limits.monthlyLimit,
  };
}
