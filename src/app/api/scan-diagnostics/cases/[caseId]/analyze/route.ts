import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { runScanAnalysis } from "@/lib/scan-diagnostics/analyze";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to run diagnostic analysis." }, { status: 401 });
    }

    const plan = await getEffectivePlan(user.id, user.email ?? null);
    const provider = new AnthropicDiagnosticProvider();

    const result = await runScanAnalysis(user.id, caseId, plan, provider);
    return NextResponse.json(result);
  } catch (err) {
    return toSafeErrorResponse(err, "analyze case");
  }
}
