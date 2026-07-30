import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getCompletionSummary, markCaseComplete } from "@/lib/scan-diagnostics/workbench";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { recordEvent } from "@/lib/analytics/events";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in to view completion status." }, { status: 401 });

    const summary = await getCompletionSummary(user.id, caseId);
    return NextResponse.json({ summary });
  } catch (err) {
    return toSafeErrorResponse(err, "get completion summary");
  }
}

// Deliberately does not require getCompletionSummary(...).readyToComplete —
// that flag is advisory (surfaced in the UI's pre-completion summary), not a
// hard server-side gate; a technician may have a genuine reason to close a
// case with some steps intentionally skipped. It never silently completes a
// case without the technician's own explicit request, though — this route
// is the only thing that sets technician_completed_at/by.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in to complete this case." }, { status: 401 });

    const scanCase = await markCaseComplete(user.id, caseId);
    await recordEvent("diagnostic_report_completed", { userId: user.id });
    return NextResponse.json({ case: scanCase });
  } catch (err) {
    return toSafeErrorResponse(err, "mark case complete");
  }
}
