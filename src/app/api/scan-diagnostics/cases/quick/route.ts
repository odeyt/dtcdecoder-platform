import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { createQuickDiagnosticCase, findExistingCasesForVin } from "@/lib/scan-diagnostics/cases";
import { runScanAnalysis } from "@/lib/scan-diagnostics/analyze";
import { OpenAiDiagnosticProvider } from "@/lib/scan-diagnostics/ai/openai-provider";
import { QuickDiagnosticCaseInputSchema } from "@/lib/scan-diagnostics/schemas";
import { DuplicateVinError, FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// "Run Full AI Diagnosis" entry point reachable from DTC search results —
// create a case from typed details (no file) and analyze it in one
// request. Reuses runScanAnalysis completely unchanged: entitlement/quota
// enforcement, the cost-estimate/hard-ceiling guard, model routing, and
// reserve/commit/refund semantics are exactly the same as the file-upload
// path, because this route creates an ordinary scan_cases row and hands
// its id to the exact same orchestrator function.
export async function POST(request: NextRequest) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: t.signInToRunQuickReport }, { status: 401 });
    }

    const plan = await getEffectivePlan(user.id, user.email ?? null);

    // Checked here (before creating a case that could never be analyzed)
    // purely for a clearer, faster-failing error — runScanAnalysis's own
    // recordAiDiagnosticUsage call would reject a Free request anyway
    // (its daily allowance is 0), so this isn't a second enforcement
    // mechanism, just an earlier exit for a request that's guaranteed to
    // fail there.
    if (!canAccessFullDiagnostics(plan)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UPGRADE_REQUIRED",
            message: t.fullAiDiagnosisUpgradeRequired,
            upgradeRequired: true,
          },
        },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = QuickDiagnosticCaseInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidDiagnosticCaseInfo }, { status: 400 });
    }

    // Same VIN, same user, no confirmation yet -> warn instead of creating
    // a second case (and a second charge) for a vehicle already run. See
    // DuplicateVinError.
    if (parsed.data.vin && !parsed.data.confirmDuplicateVin) {
      const existingCases = await findExistingCasesForVin(user.id, parsed.data.vin);
      if (existingCases.length > 0) {
        throw new DuplicateVinError(parsed.data.vin, existingCases);
      }
    }

    const scanCase = await createQuickDiagnosticCase(user.id, parsed.data);
    const provider = new OpenAiDiagnosticProvider();
    const result = await runScanAnalysis(user.id, scanCase.id, plan, provider);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "quick diagnostic case");
  }
}
