import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getVerification, upsertVerification } from "@/lib/scan-diagnostics/workbench";
import { VerificationInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

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
    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToViewVerificationChecklist }, { status: 401 });
    }

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
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToUpdateVerificationChecklist }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
    }

    const parsed = VerificationInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidVerificationUpdate }, { status: 400 });
    }

    const verification = await upsertVerification(user.id, caseId, parsed.data);
    return NextResponse.json({ verification });
  } catch (err) {
    return toSafeErrorResponse(err, "update verification checklist");
  }
}
