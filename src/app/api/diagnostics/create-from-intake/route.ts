import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { createQuickDiagnosticCase } from "@/lib/scan-diagnostics/cases";
import { QuickDiagnosticCaseInputSchema } from "@/lib/scan-diagnostics/schemas";
import { IntakeSchema } from "@/lib/landing-intake/schema";
import { recordEvent } from "@/lib/analytics/events";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// Authenticated handoff from the anonymous landing intake
// (ServiceBayHero) into a real diagnostic case. Deliberately calls
// createQuickDiagnosticCase directly — NOT the existing
// /api/scan-diagnostics/cases/quick route, which also immediately runs
// runScanAnalysis and hard-blocks the Free plan. A visitor who filled out
// the landing intake and just signed in should always get a saved case
// (regardless of plan) landing them on the case page; running the paid
// analysis is a separate, explicit action from there, gated by the
// existing entitlement checks exactly as it already is for the
// file-upload flow. See docs/LANDING_DIAGNOSTIC_INTAKE.md.
const RequestSchema = z.object({ intake: IntakeSchema });

export async function POST(request: NextRequest) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: t.signInToContinueCase }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: t.invalidDiagnosticIntakeData }, { status: 400 });
    }

    const { intake } = parsed.data;
    const dtcCode = intake.dtcCodes[0];
    if (!dtcCode) {
      // No identifiable code — a quick case needs one required field
      // (QuickDiagnosticCaseInputSchema.dtcCode). Rather than fabricate a
      // placeholder code, the client falls back to the Import Vehicle Scan
      // path, which builds a case from real scan-tool content instead.
      return NextResponse.json(
        { error: t.noDtcCodeIdentified, code: "NO_DTC_CODE" },
        { status: 422 },
      );
    }

    const parsedYear = intake.year ? Number(intake.year) : undefined;
    const caseInput = QuickDiagnosticCaseInputSchema.safeParse({
      dtcCode,
      vin: intake.vin,
      make: intake.make,
      model: intake.model,
      modelYear: parsedYear && Number.isInteger(parsedYear) ? parsedYear : undefined,
      engine: intake.engine,
      symptoms: intake.symptoms ? [intake.symptoms] : undefined,
      scanToolNotes: intake.complaint,
      reportLanguage: intake.locale,
    });
    if (!caseInput.success) {
      return NextResponse.json({ error: t.invalidDiagnosticCaseInfo }, { status: 400 });
    }

    const scanCase = await createQuickDiagnosticCase(user.id, caseInput.data);

    await recordEvent("diagnostic_case_created_from_intake", { userId: user.id, metadata: { hasDtcCode: true } });

    return NextResponse.json({ caseId: scanCase.id }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "create diagnostic case from intake");
  }
}
