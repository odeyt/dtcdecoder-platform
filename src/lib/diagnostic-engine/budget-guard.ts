// Phase 2.2 Steps 6-7 — aggregate provider-cost budget guard for the
// Diagnostic Engine (docs/PHASE_2_2_COST_GUARDRAILS.md). The existing
// per-request cost ceiling (ai-diagnostics/cost.ts's guardCostCeiling)
// only bounds a SINGLE call — nothing previously bounded total spend
// across many turns. This module mirrors the design already established
// for scan-report/chat (ai-diagnostics/budget-guard.ts: warning/restrict/
// hard_stop states, percent-of-limit thresholds, fresh-read-every-call, no
// caching) but reads from diagnostic_engine_runs (this feature's own cost
// ledger — migration 0033/0035) rather than ai_diagnostic_runs, since
// turn-shaped spend must never be pooled with report/chat spend (same
// reasoning as the turn-count ledger split in entitlements.ts/usage.ts).
//
// Provider PRICING itself is never duplicated here — every cost figure
// this module sums was already computed by the SAME centralized registry
// (ai-diagnostics/cost.ts's computeActualCostMicros) at the time each run
// was recorded; this module only aggregates already-computed costs.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DiagnosticEngineBudgetState = "normal" | "warning" | "restrict" | "hard_stop";

const STATE_SEVERITY: Record<DiagnosticEngineBudgetState, number> = { normal: 0, warning: 1, restrict: 2, hard_stop: 3 };

function worseOf(a: DiagnosticEngineBudgetState, b: DiagnosticEngineBudgetState): DiagnosticEngineBudgetState {
  return STATE_SEVERITY[b] > STATE_SEVERITY[a] ? b : a;
}

export interface DiagnosticEngineBudgetStatus {
  state: DiagnosticEngineBudgetState;
  reasons: string[];
  /** Which dimension caused the worst state — for observability only, never shown to the end user. */
  blockedScope: string | null;
}

// Message shown to ordinary users on a hard stop — never the underlying $
// figures or which specific budget dimension triggered it (Step 7: "Do not
// expose internal budget figures to ordinary users"). The detailed
// `reasons` are for server-side observability only.
export const BUDGET_EXHAUSTED_USER_MESSAGE =
  "The diagnostic service is temporarily unavailable because its usage limit has been reached. Your case and evidence remain saved.";

export class DiagnosticEngineBudgetExceededError extends Error {
  constructor(readonly reasons: string[], readonly blockedScope: string | null) {
    super(BUDGET_EXHAUSTED_USER_MESSAGE);
    this.name = "DiagnosticEngineBudgetExceededError";
  }
}

export class DiagnosticEngineKillSwitchError extends Error {
  constructor() {
    super(BUDGET_EXHAUSTED_USER_MESSAGE);
    this.name = "DiagnosticEngineKillSwitchError";
  }
}

function envUsd(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export interface DiagnosticEngineBudgetLimitsUsd {
  globalDaily?: number;
  globalMonthly?: number;
  userDaily?: number;
  userMonthly?: number;
  internalDaily?: number;
}

// Read fresh per call (functions, not cached module-level consts) —
// matches orchestrator-config.ts's established convention so a budget
// change via env var takes effect on the very next request, not after a
// restart.
export function getDiagnosticEngineBudgetLimitsUsd(): DiagnosticEngineBudgetLimitsUsd {
  return {
    globalDaily: envUsd("DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD"),
    globalMonthly: envUsd("DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD"),
    userDaily: envUsd("DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD"),
    userMonthly: envUsd("DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD"),
    internalDaily: envUsd("DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD"),
  };
}

// Emergency global stop — checked before any budget arithmetic, since it
// should block every Diagnostic Engine provider call immediately
// regardless of remaining budget on any dimension.
export function isDiagnosticEngineKillSwitchActive(): boolean {
  return process.env.DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH === "true";
}

// Percent-of-limit thresholds reused from the existing scan-report/chat
// budget guard's config rather than a second, possibly-inconsistent copy
// — "warning"/"restrict"/"hard_stop" mean the same thing across every
// AI-calling feature in this app.
function defaultThresholds() {
  return { warning: 70, restrict: 90, hardStop: 100 };
}

function utcMidnightIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function utcMonthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function sumCostMicros(since: string, filters: { userId?: string; internalOnly?: boolean } = {}): Promise<number> {
  const admin = createAdminClient();
  let query = admin
    .from("diagnostic_engine_runs")
    .select("estimated_cost_usd")
    .gte("created_at", since)
    .not("estimated_cost_usd", "is", null);
  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.internalOnly) query = query.eq("is_internal", true);

  const { data, error } = await query;
  if (error) throw error;
  // estimated_cost_usd is stored as a real USD figure (not micros) in
  // diagnostic_engine_runs — see observability.ts — so this sums directly,
  // no microsToUsd conversion needed here (that helper is used elsewhere
  // for the micros-denominated ai_diagnostic_runs table only).
  return (data ?? []).reduce((sum, row) => sum + (Number(row.estimated_cost_usd) || 0), 0);
}

function considerDimension(
  worst: DiagnosticEngineBudgetState,
  worstScope: string | null,
  reasons: string[],
  usedUsd: number,
  limitUsd: number | undefined,
  scopeLabel: string,
): { state: DiagnosticEngineBudgetState; scope: string | null } {
  if (limitUsd === undefined) return { state: worst, scope: worstScope };
  const thresholds = defaultThresholds();
  const pct = (usedUsd / limitUsd) * 100;

  let next: DiagnosticEngineBudgetState = "normal";
  if (pct >= thresholds.hardStop) next = "hard_stop";
  else if (pct >= thresholds.restrict) next = "restrict";
  else if (pct >= thresholds.warning) next = "warning";

  if (next === "normal") return { state: worst, scope: worstScope };
  reasons.push(`${scopeLabel}: $${usedUsd.toFixed(2)}/$${limitUsd.toFixed(2)} (${pct.toFixed(0)}%)`);
  const combined = worseOf(worst, next);
  return { state: combined, scope: combined === next && STATE_SEVERITY[next] >= STATE_SEVERITY[worst] ? scopeLabel : worstScope };
}

// Computed fresh on every call — a stale "normal" reading past the real
// hard-stop moment would defeat the entire point of a budget guard. Cheap
// relative to the AI call it gates (a handful of indexed aggregate reads).
export async function computeDiagnosticEngineBudgetState(
  userId: string,
  isInternal: boolean,
): Promise<DiagnosticEngineBudgetStatus> {
  const limits = getDiagnosticEngineBudgetLimitsUsd();

  const [globalDaily, globalMonthly, userDaily, userMonthly, internalDaily] = await Promise.all([
    sumCostMicros(utcMidnightIso()),
    sumCostMicros(utcMonthStartIso()),
    sumCostMicros(utcMidnightIso(), { userId }),
    sumCostMicros(utcMonthStartIso(), { userId }),
    isInternal ? sumCostMicros(utcMidnightIso(), { internalOnly: true }) : Promise.resolve(0),
  ]);

  let state: DiagnosticEngineBudgetState = "normal";
  let scope: string | null = null;
  const reasons: string[] = [];

  ({ state, scope } = considerDimension(state, scope, reasons, globalDaily, limits.globalDaily, "global_daily"));
  ({ state, scope } = considerDimension(state, scope, reasons, globalMonthly, limits.globalMonthly, "global_monthly"));
  ({ state, scope } = considerDimension(state, scope, reasons, userDaily, limits.userDaily, "user_daily"));
  ({ state, scope } = considerDimension(state, scope, reasons, userMonthly, limits.userMonthly, "user_monthly"));
  // Internal testers are NOT unlimited by default — a dedicated (and, by
  // default, unset/unlimited-until-configured) budget line keeps their
  // usage bounded once the owner sets one, without affecting ordinary
  // users' own limits.
  if (isInternal) {
    ({ state, scope } = considerDimension(state, scope, reasons, internalDaily, limits.internalDaily, "internal_daily"));
  }

  return { state, reasons, blockedScope: scope };
}

// Throws only at hard_stop — warning/restrict states are informational
// (surfaced via observability, not blocking) so the site owner sees
// pressure building before generation actually stops.
export function assertDiagnosticEngineBudgetAllows(status: DiagnosticEngineBudgetStatus): void {
  if (status.state === "hard_stop") {
    throw new DiagnosticEngineBudgetExceededError(status.reasons, status.blockedScope);
  }
}
