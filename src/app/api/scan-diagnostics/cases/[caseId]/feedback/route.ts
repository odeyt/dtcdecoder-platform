import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { submitFeedback, getFeedbackForCase } from "@/lib/scan-diagnostics/feedback";
import { FeedbackInputSchema } from "@/lib/scan-diagnostics/schemas";
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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToSubmitFeedback }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
    }

    const parsed = FeedbackInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidFeedback }, { status: 400 });
    }

    const feedback = await submitFeedback(user.id, caseId, parsed.data);
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "submit feedback");
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { caseId } = await params;

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const user = await requireUser();
    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToViewFeedback }, { status: 401 });
    }

    const feedback = await getFeedbackForCase(user.id, caseId);
    return NextResponse.json({ feedback });
  } catch (err) {
    return toSafeErrorResponse(err, "get feedback");
  }
}
