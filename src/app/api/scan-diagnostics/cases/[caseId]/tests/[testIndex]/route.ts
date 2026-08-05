import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { upsertTestProgress } from "@/lib/scan-diagnostics/workbench";
import { TestProgressInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { recordEvent } from "@/lib/analytics/events";

interface RouteParams {
  params: Promise<{ caseId: string; testIndex: string }>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { caseId, testIndex: testIndexParam } = await params;
  const testIndex = Number(testIndexParam);

  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();
    if (!Number.isInteger(testIndex) || testIndex < 0) {
      return NextResponse.json({ error: "Invalid test index" }, { status: 400 });
    }

    const user = await requireUser();
    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToUpdateTestProgress }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = TestProgressInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid test progress update" }, { status: 400 });
    }

    const progress = await upsertTestProgress(user.id, caseId, testIndex, parsed.data);

    // Never send actual_result/technician_note — only the structural facts.
    if (parsed.data.completed !== undefined) {
      await recordEvent("diagnostic_report_test_checked", {
        userId: user.id,
        metadata: { testIndex, completed: progress.completed },
      });
    }
    if (parsed.data.outcome !== undefined) {
      await recordEvent("diagnostic_report_test_outcome_changed", {
        userId: user.id,
        metadata: { testIndex, outcome: progress.outcome },
      });
    }

    return NextResponse.json({ progress });
  } catch (err) {
    return toSafeErrorResponse(err, "update test progress");
  }
}
