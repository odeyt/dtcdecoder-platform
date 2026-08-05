import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canViewScanFeedbackHistory } from "@/lib/scan-diagnostics/entitlements";
import { listFeedbackHistory } from "@/lib/scan-diagnostics/feedback";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// Workshop-plan-only aggregated history view — submitting feedback on an
// individual case (POST .../cases/[caseId]/feedback) is available on every
// plan; only this cross-case history rollup is gated.
export async function GET(_request: NextRequest) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToViewFeedbackHistory }, { status: 401 });
    }

    const plan = await getEffectivePlan(user.id, user.email ?? null);
    if (!canViewScanFeedbackHistory(plan)) {
      return NextResponse.json(
        { error: "Feedback history is available on the Workshop plan. Upgrade to unlock it." },
        { status: 403 },
      );
    }

    const history = await listFeedbackHistory(user.id);
    return NextResponse.json({ history });
  } catch (err) {
    return toSafeErrorResponse(err, "list feedback history");
  }
}
