import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getVerification, upsertVerification } from "@/lib/scan-diagnostics/workbench";
import { VerificationInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";

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
    if (!user) return NextResponse.json({ error: "Sign in to view the verification checklist." }, { status: 401 });

    const verification = await getVerification(user.id, caseId);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "get verification checklist");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Sign in to update the verification checklist." }, { status: 401 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = VerificationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid verification update" }, { status: 400 });
    }

    const verification = await upsertVerification(user.id, caseId, parsed.data);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "update verification checklist");
  }
}
