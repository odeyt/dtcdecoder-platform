import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { upsertCauseStatus } from "@/lib/scan-diagnostics/workbench";
import { CauseStatusInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { recordEvent } from "@/lib/analytics/events";

interface RouteParams {
  params: Promise<{ caseId: string; causeIndex: string }>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId, causeIndex: causeIndexParam } = await params;
  const causeIndex = Number(causeIndexParam);

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    if (!Number.isInteger(causeIndex) || causeIndex < 0) {
      return NextResponse.json({ error: t.invalidCauseIndex }, { status: 400 });
    }

    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: t.signInToUpdateFinding }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
    }

    const parsed = CauseStatusInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidCauseStatusUpdate }, { status: 400 });
    }

    const status = await upsertCauseStatus(user.id, caseId, causeIndex, parsed.data);

    if (parsed.data.reviewed !== undefined) {
      await recordEvent("diagnostic_report_finding_reviewed", {
        userId: user.id,
        metadata: { causeIndex, reviewed: status.reviewed },
      });
    }
    if (parsed.data.status !== undefined) {
      await recordEvent("diagnostic_report_cause_status_changed", {
        userId: user.id,
        metadata: { causeIndex, status: status.status },
      });
    }

    return NextResponse.json({ status });
  } catch (err) {
    return toSafeErrorResponse(err, "update cause status");
  }
}
