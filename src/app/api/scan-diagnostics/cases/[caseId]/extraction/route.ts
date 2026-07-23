import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getCaseForOwner, transitionCaseStatus } from "@/lib/scan-diagnostics/cases";
import { applyExtractionReview } from "@/lib/scan-diagnostics/extraction";
import { ExtractionReviewInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Sign in to review this case." }, { status: 401 });
    }

    await getCaseForOwner(user.id, caseId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = ExtractionReviewInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid extraction review" }, { status: 400 });
    }

    await applyExtractionReview(caseId, parsed.data);

    const scanCase = parsed.data.confirm
      ? await transitionCaseStatus(caseId, "extraction_review", "ready_for_analysis")
      : await getCaseForOwner(user.id, caseId);

    return NextResponse.json({ case: scanCase });
  } catch (err) {
    return toSafeErrorResponse(err, "review extraction");
  }
}
