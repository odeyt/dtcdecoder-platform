import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { regenerateScanAnalysis } from "@/lib/scan-diagnostics/analyze";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

// One permitted final-report regeneration for a purchased Professional
// Diagnostic Report (PROFESSIONAL_REPORT_ONE_TIME.maxRegenerations) —
// distinct from /analyze, which only ever runs once per case (see that
// route's status-transition guard). Never consumes a new usage slot or
// purchase credit; see regenerateScanAnalysis for the atomic limit check.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToRegenerateReport }, { status: 401 });
    }

    const plan = await getEffectivePlan(user.id, user.email ?? null);
    const provider = new AnthropicDiagnosticProvider();

    const result = await regenerateScanAnalysis(user.id, caseId, plan, provider);
    return NextResponse.json(result);
  } catch (err) {
    return toSafeErrorResponse(err, "regenerate case");
  }
}
