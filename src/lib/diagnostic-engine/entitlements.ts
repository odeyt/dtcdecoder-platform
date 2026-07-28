// Phase 2.1 canonical entitlement registry for the Diagnostic Engine
// (docs/PHASE_2_1_INTEGRATION_AUDIT.md §4). Deliberately SEPARATE from
// AI_DIAGNOSTIC_ENTITLEMENTS (pricing.ts) — that registry's numbers are
// report-shaped ("30 full reports/month"); a Diagnostic Engine "turn" is a
// much smaller, more frequent unit of work (roughly one per question
// answered), so reusing the same numbers would either exhaust a
// technician's report allowance after a handful of questions or require
// guessing at a conversion ratio this phase's spec doesn't define.
//
// Canonical feature keys — every route/UI check should call
// hasFeatureAccess(plan, key) with one of these, never re-check a plan
// name directly. This is what "do not duplicate entitlement logic across
// API routes" means in practice.
import { AI_DIAGNOSTIC_ENTITLEMENTS } from "@/lib/pricing";
import { isInternalDiagnosticTester } from "@/lib/diagnostic-engine/feature-flags";
import type { SubscriptionPlan } from "@/lib/types";

export type DiagnosticEngineFeatureKey =
  | "diagnostic_engine_turn"
  | "guided_diagnosis"
  | "repair_verification"
  | "advanced_test_planner";

interface DiagnosticEngineFeatureAccess {
  /** null = unlimited on this dimension. Only meaningful for diagnostic_engine_turn. */
  turnDailyLimit: number | null;
  turnMonthlyLimit: number | null;
  guidedDiagnosisEnabled: boolean;
  repairVerificationEnabled: boolean;
  advancedTestPlannerEnabled: boolean;
}

// Initial, conservative values — easy to retune later without touching any
// call site, since every consumer goes through the functions below rather
// than reading this object directly. Free gets a small daily/monthly taste
// (a "locked professional preview" in spirit: real turns, but few of them,
// then a clear upgrade prompt) rather than zero access outright.
const DIAGNOSTIC_ENGINE_ENTITLEMENTS: Record<SubscriptionPlan, DiagnosticEngineFeatureAccess> = {
  free: {
    turnDailyLimit: 3,
    turnMonthlyLimit: 10,
    guidedDiagnosisEnabled: true,
    repairVerificationEnabled: false,
    advancedTestPlannerEnabled: false,
  },
  pro: {
    turnDailyLimit: 20,
    turnMonthlyLimit: 200,
    guidedDiagnosisEnabled: true,
    repairVerificationEnabled: true,
    advancedTestPlannerEnabled: true,
  },
  workshop: {
    turnDailyLimit: 60,
    turnMonthlyLimit: 600,
    guidedDiagnosisEnabled: true,
    repairVerificationEnabled: true,
    advancedTestPlannerEnabled: true,
  },
};

export function hasFeatureAccess(plan: SubscriptionPlan, key: DiagnosticEngineFeatureKey): boolean {
  const access = DIAGNOSTIC_ENGINE_ENTITLEMENTS[plan];
  switch (key) {
    case "diagnostic_engine_turn":
      return access.turnDailyLimit === null || access.turnDailyLimit > 0;
    case "guided_diagnosis":
      return access.guidedDiagnosisEnabled;
    case "repair_verification":
      return access.repairVerificationEnabled;
    case "advanced_test_planner":
      return access.advancedTestPlannerEnabled;
  }
}

export interface DiagnosticEngineTurnLimits {
  dailyLimit: number | null;
  monthlyLimit: number | null;
}

export function turnLimitsForPlan(plan: SubscriptionPlan): DiagnosticEngineTurnLimits {
  const access = DIAGNOSTIC_ENGINE_ENTITLEMENTS[plan];
  return { dailyLimit: access.turnDailyLimit, monthlyLimit: access.turnMonthlyLimit };
}

// Same categorical concept already used for scan-report/chat redaction
// (ai-diagnostics/entitlements.ts's AiDiagnosticAccessLevel) — reused here
// rather than inventing a parallel enum. "internal" is added as a THIRD
// value distinct from preview/full: an allowlisted tester's usage is
// always recorded, but never counted against — or confused with — any
// real plan's own limits.
export type DiagnosticEngineAccessLevel = "preview" | "full" | "internal";

export function accessLevelForPlan(plan: SubscriptionPlan): "preview" | "full" {
  return AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticMonthlyLimit > 0 ? "full" : "preview";
}

export interface ResolvedDiagnosticEngineAccess {
  isInternal: boolean;
  accessLevel: DiagnosticEngineAccessLevel;
  limits: DiagnosticEngineTurnLimits;
}

// The single decision point every route/orchestrator call goes through —
// resolves an internal tester to unlimited-but-still-recorded access,
// otherwise falls back to the plan's own registry entry. Never trust a
// client-supplied plan or "internal" flag; `email` must come from the
// server-verified session, `plan` from getEffectivePlan().
export function resolveDiagnosticEngineAccess(
  email: string | null | undefined,
  plan: SubscriptionPlan,
): ResolvedDiagnosticEngineAccess {
  if (isInternalDiagnosticTester(email)) {
    return { isInternal: true, accessLevel: "internal", limits: { dailyLimit: null, monthlyLimit: null } };
  }
  return { isInternal: false, accessLevel: accessLevelForPlan(plan), limits: turnLimitsForPlan(plan) };
}
