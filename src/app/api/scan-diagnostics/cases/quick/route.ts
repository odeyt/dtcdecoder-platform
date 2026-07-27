import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { createQuickDiagnosticCase } from "@/lib/scan-diagnostics/cases";
import { runScanAnalysis } from "@/lib/scan-diagnostics/analyze";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { QuickDiagnosticCaseInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to run an AI diagnostic report." }, { status: 401 });
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
            message: "Full AI diagnosis is available on Pro Technician and Workshop plans.",
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
      return NextResponse.json({ error: "Invalid diagnostic case information" }, { status: 400 });
    }

    const scanCase = await createQuickDiagnosticCase(user.id, parsed.data);
    const provider = new AnthropicDiagnosticProvider();
    const result = await runScanAnalysis(user.id, scanCase.id, plan, provider);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "quick diagnostic case");
  }
}
