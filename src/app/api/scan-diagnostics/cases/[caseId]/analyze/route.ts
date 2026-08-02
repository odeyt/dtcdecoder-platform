import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { runScanAnalysis } from "@/lib/scan-diagnostics/analyze";
import { getCaseForOwner, findExistingCasesForVin, getVinForCase } from "@/lib/scan-diagnostics/cases";
import { AnthropicDiagnosticProvider } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import { DuplicateVinError, FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    await getCaseForOwner(user.id, caseId);

    // The button that calls this route sends no body at all on a normal
    // run — only "continue anyway" after a duplicate-VIN warning sends
    // { confirmDuplicateVin: true }, so an empty/missing body just means
    // "not confirmed yet," not an error.
    let confirmDuplicateVin = false;
    try {
      const body = (await request.json()) as { confirmDuplicateVin?: boolean } | null;
      confirmDuplicateVin = Boolean(body?.confirmDuplicateVin);
    } catch {
      confirmDuplicateVin = false;
    }

    if (!confirmDuplicateVin) {
      const vin = await getVinForCase(caseId);
      if (vin) {
        const existingCases = await findExistingCasesForVin(user.id, vin, caseId);
        if (existingCases.length > 0) {
          throw new DuplicateVinError(vin, existingCases);
        }
      }
    }

    const plan = await getEffectivePlan(user.id, user.email ?? null);
    const provider = new AnthropicDiagnosticProvider();

    const result = await runScanAnalysis(user.id, caseId, plan, provider);
    return NextResponse.json(result);
  } catch (err) {
    return toSafeErrorResponse(err, "analyze case");
  }
}
