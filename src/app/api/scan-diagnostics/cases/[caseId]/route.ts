import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getCaseDetail } from "@/lib/scan-diagnostics/cases";
import { resolveReportAccess } from "@/lib/scan-diagnostics/report-access";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

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
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToViewCase }, { status: 401 });
    }

    const detail = await getCaseDetail(user.id, caseId);
    // Never let the raw (always-full) report reach a free-tier client —
    // resolveReportAccess replaces it with a plan-appropriate, server-
    // redacted view before this response is ever serialized. Built out
    // field-by-field (not `...detail`) so the raw `report` can't
    // accidentally leak back in.
    const reportAccess = await resolveReportAccess(user.id, user.email ?? null, detail);
    return NextResponse.json({
      case: detail.case,
      files: detail.files,
      extraction: detail.extraction,
      dtcRecords: detail.dtcRecords,
      report: reportAccess,
    });
  } catch (err) {
    return toSafeErrorResponse(err, "get case");
  }
}
