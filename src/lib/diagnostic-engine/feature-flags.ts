// Phase 2 diagnostic-engine feature flags (docs/PHASE_2_ARCHITECTURE.md).
// Every flag defaults OFF — an unconfigured environment has none of this
// engine wired into any live request path, so Phase 1 behavior is
// completely unaffected until these are explicitly turned on. Read fresh
// from process.env on each call (functions, not module-level consts),
// matching the established pattern in
// src/lib/ai-diagnostics/orchestrator-config.ts.
import "server-only";

function flag(name: string): boolean {
  return process.env[name] === "true";
}

export const DIAGNOSTIC_ENGINE_FLAGS = {
  diagnosticGraphEnabled: () => flag("DIAGNOSTIC_GRAPH_ENABLED"),
  questionEngineEnabled: () => flag("QUESTION_ENGINE_ENABLED"),
  probabilityEngineEnabled: () => flag("PROBABILITY_ENGINE_ENABLED"),
  confidenceEngineEnabled: () => flag("CONFIDENCE_ENGINE_ENABLED"),
  repairVerificationEnabled: () => flag("REPAIR_VERIFICATION_ENABLED"),
  testPlannerEnabled: () => flag("TEST_PLANNER_ENABLED"),
};

// Phase 2.1 staged rollout (docs/PHASE_2_1_RELEASE_PLAN.md). A SEPARATE
// allowlist from ADMIN_ALLOWED_EMAILS (admin-auth.ts) — an internal
// diagnostic-engine tester is not necessarily an admin, and reusing the
// admin list would either under-grant testers or over-grant admin surface
// access to them. Same comma-separated-email-list pattern as
// env.adminAllowedEmails() for consistency.
export function diagnosticEngineAllowedEmails(): string[] {
  return (process.env.DIAGNOSTIC_ENGINE_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isInternalDiagnosticTester(email: string | null | undefined): boolean {
  if (!email) return false;
  return diagnosticEngineAllowedEmails().includes(email.toLowerCase());
}

// Rollout tiers (Step 7) — layered ON TOP of the per-module flags above,
// which must still all be off by default. This is the master gate a route
// checks FIRST: even with every per-module flag on, the route stays
// unreachable for anyone until the rollout tier says otherwise.
export type DiagnosticEngineRolloutTier = "disabled" | "internal_only" | "allowlist_only" | "all_paid_users";

export function diagnosticEngineRolloutTier(): DiagnosticEngineRolloutTier {
  const raw = process.env.DIAGNOSTIC_ENGINE_ROLLOUT_TIER;
  if (raw === "internal_only" || raw === "allowlist_only" || raw === "all_paid_users") return raw;
  return "disabled";
}

// The single place that decides "can THIS caller reach the Diagnostic
// Engine at all right now" — independent of per-turn entitlement limits
// (src/lib/diagnostic-engine/entitlements.ts), which apply afterward for
// callers this function admits. Never trust a client-supplied flag; this
// always reads server-side env state.
export function isDiagnosticEngineRolloutAllowed(
  email: string | null | undefined,
  isAdmin: boolean,
): boolean {
  switch (diagnosticEngineRolloutTier()) {
    case "disabled":
      return false;
    // "Internal/admin accounts only" — reuses the EXISTING admin
    // allowlist (ADMIN_ALLOWED_EMAILS), a genuinely different, narrower
    // population than the diagnostic-engine tester list below.
    case "internal_only":
      return isAdmin;
    // "Explicit user allowlist" — a broader beta-tester population that
    // need not be admins at all (e.g. one specific shop owner piloting
    // early access).
    case "allowlist_only":
      return isInternalDiagnosticTester(email);
    case "all_paid_users":
      return true; // plan-level gating (free vs. paid) is still enforced by entitlements.ts afterward
  }
}
