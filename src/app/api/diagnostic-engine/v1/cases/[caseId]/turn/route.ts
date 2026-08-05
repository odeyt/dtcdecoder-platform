// Phase 2 Diagnostic Engine — POST advances a case's engine one turn
// (docs/PHASE_2_ARCHITECTURE.md, spec item 15: "API — versioned
// endpoints. Do not break Phase 1."). Versioned under /v1 as its own new
// namespace rather than reusing /api/scan-diagnostics — this is additive,
// not a replacement for the existing scan-report analyze route, which is
// untouched.
//
// Layered gating (docs/PHASE_2_1_RELEASE_PLAN.md):
// 1. PROBABILITY_ENGINE_ENABLED (module flag, default off) — 404 if off.
// 2. Diagnostic Engine rollout tier (default "disabled") — 404 if this
//    caller isn't in the currently-allowed tier. Checked BEFORE ownership
//    so an out-of-rollout caller learns nothing about whether the case
//    exists.
// 3. Case ownership (inside the orchestrator).
// 4. Per-turn entitlement/usage limits (inside the orchestrator) — a 429
//    with an upgrade-aware error shape, not a silent bypass.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/subscriptions";
import { isAllowedAdminEmail } from "@/lib/admin-auth";
import { DIAGNOSTIC_ENGINE_FLAGS, diagnosticEngineRolloutTier, isDiagnosticEngineRolloutAllowed } from "@/lib/diagnostic-engine/feature-flags";
import { runDiagnosticEngineTurn } from "@/lib/diagnostic-engine/orchestrator";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { getOrCreateLocalizedTurn } from "@/lib/diagnostic-engine/turn-localization";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

const TurnBodySchema = z.object({
  // Client-generated (crypto.randomUUID()), matching the existing
  // DTC Assistant chat pattern — the idempotency key for this specific
  // turn attempt, so a client retry after a network error never
  // double-consumes the caller's entitlement or double-calls the provider.
  requestId: z.string().min(1),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    if (!DIAGNOSTIC_ENGINE_FLAGS.probabilityEngineEnabled()) {
      return NextResponse.json({ error: t.diagnosticEngineNotAvailable }, { status: 404 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: t.signInToUseDiagnosticEngine }, { status: 401 });
    }

    const isAdmin = isAllowedAdminEmail(user.email);
    if (!isDiagnosticEngineRolloutAllowed(user.email, isAdmin)) {
      return NextResponse.json({ error: t.diagnosticEngineNotAvailable }, { status: 404 });
    }

    const parsed = TurnBodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidTurnRequestPayload }, { status: 400 });
    }

    // Fail closed: any error resolving the plan denies the request rather
    // than defaulting to an assumed plan (docs/PHASE_2_1_INTEGRATION_AUDIT.md
    // Step 4) — getEffectivePlan already throws on a Supabase error rather
    // than silently returning a default, so simply not catching it here is
    // itself the fail-closed behavior.
    const plan = await getEffectivePlan(user.id, user.email ?? null);

    const provider = new AnthropicDiagnosticProvider();
    const result = await runDiagnosticEngineTurn(user.id, caseId, provider, {
      plan,
      email: user.email ?? null,
      rolloutTier: diagnosticEngineRolloutTier(),
      requestId: parsed.data.requestId,
    });

    // Alertable canary (docs/DIAGNOSTIC_ENGINE_SAFETY_NULL_AUDIT.md): the
    // type system now guarantees `result.safety` is never null, but this
    // guards against a future regression reintroducing the exact bug this
    // fix closed. Expected count in production: always zero. Logs only
    // case/request identifiers — never evidence content, prompts, or
    // customer data.
    if (!result.safety) {
      console.error("ALERT diagnostic_engine_safety_missing", { caseId, requestId: parsed.data.requestId });
    }

    // Presentation-only: translates hypotheses/testPlan prose for display,
    // reusing the case's existing report_language selection (the same field
    // the Scan Report Analysis language switcher already sets — see
    // /api/scan-diagnostics/cases/[caseId]/language). Everything upstream
    // (evidence, probability/confidence engines, safety classification,
    // difficulty/risk/cost derivation) already ran in English above and is
    // never re-run or re-derived here. safety.reasoning is deliberately
    // left untranslated (see turn-translation.ts). A translation failure
    // falls back to the English result already computed — never blocks the
    // turn itself.
    if (result.hypotheses.length > 0 || result.testPlan.length > 0) {
      try {
        const admin = createAdminClient();
        const { data: caseRow } = await admin.from("scan_cases").select("report_language").eq("id", caseId).maybeSingle();
        const targetLocale = caseRow?.report_language;
        if (targetLocale && targetLocale !== "en") {
          const localized = await getOrCreateLocalizedTurn(
            user.id,
            plan,
            caseId,
            { hypotheses: result.hypotheses, testPlan: result.testPlan },
            targetLocale,
          );
          result.hypotheses = localized.localized.hypotheses;
          result.testPlan = localized.localized.testPlan;
        }
      } catch (err) {
        console.error("[diagnostic-engine-turn] translation step failed, serving English", err);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return toSafeErrorResponse(err, "diagnostic engine turn");
  }
}
