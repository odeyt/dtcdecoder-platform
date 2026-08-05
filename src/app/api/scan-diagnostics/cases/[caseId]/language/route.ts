import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { getCaseForOwner } from "@/lib/scan-diagnostics/cases";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getAllowedOutputLocales } from "@/lib/i18n/languages";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

interface RouteParams {
  params: Promise<{ caseId: string }>;
}

const bodySchema = z.object({ locale: z.string().trim().min(2).max(10) });

// Lets a customer change which language an ALREADY-GENERATED report
// displays in — scan_cases.report_language previously could only be set
// once, at case-creation time, and only on the no-file quick-case path
// (QuickDiagnosticForm.tsx). Everything downstream (translation, caching
// in scan_report_localizations) already exists and needs no changes —
// resolveReportAccess/report-localization.ts re-derive the localized view
// fresh from this column on every read, so updating it here is enough;
// there is no separate "trigger a translation" step to call.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    const { caseId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: t.signInToChangeReportLanguage }, { status: 401 });
    }

    // Throws (mapped to a safe 404 below) if this case doesn't exist or
    // isn't owned by the caller — never reveals whether a different
    // user's case exists.
    await getCaseForOwner(user.id, caseId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
    }

    // Switching back to English is always allowed (no translation, no
    // cost) — every non-English target must be in this plan's allowed
    // output-locale list, the same list resolveReportAccess implicitly
    // trusts via canSelectAiReportLanguage(plan).
    if (parsed.data.locale !== "en") {
      const plan = await getEffectivePlan(user.id, user.email ?? null);
      const allowed = await getAllowedOutputLocales(plan);
      if (!allowed.some((l) => l.locale_code === parsed.data.locale)) {
        return NextResponse.json({ error: t.languageNotAvailableOnPlan }, { status: 403 });
      }
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("scan_cases")
      .update({ report_language: parsed.data.locale })
      .eq("id", caseId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    return toSafeErrorResponse(err, "update report language");
  }
}
