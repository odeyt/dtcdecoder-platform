import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getCaseDetail } from "@/lib/scan-diagnostics/cases";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const { caseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to view this case." }, { status: 401 });
    }

    const detail = await getCaseDetail(user.id, caseId);
    return NextResponse.json(detail);
  } catch (err) {
    return toSafeErrorResponse(err, "get case");
  }
}
