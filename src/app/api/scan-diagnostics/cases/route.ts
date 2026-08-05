import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { createCase } from "@/lib/scan-diagnostics/cases";
import { CaseInfoInputSchema } from "@/lib/scan-diagnostics/schemas";
import { FeatureDisabledError, toSafeErrorResponse } from "@/lib/scan-diagnostics/api-errors";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { resolveDefaultReportLanguage } from "@/lib/i18n/ai-language-server";

export async function POST(request: NextRequest) {
  try {
    if (!env.scanDiagnosticsEnabled()) throw new FeatureDisabledError();

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const locale = await resolveAppShellLocale();
      const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
      return NextResponse.json({ error: t.signInToStartCase }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const parsed = CaseInfoInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid case information" }, { status: 400 });
    }

    // No client currently sends reportLanguage on this path (unlike the
    // quick-diagnostic form, which has its own selector) — default it to
    // whatever this signed-in user's account/region/UI already resolve to,
    // so an uploaded report doesn't silently stay English just because
    // nobody thought to use ScanReportLanguageSwitcher after the fact.
    const reportLanguage =
      parsed.data.reportLanguage ?? (await resolveDefaultReportLanguage(user.id, user.email ?? null));

    const scanCase = await createCase(user.id, { ...parsed.data, reportLanguage });
    return NextResponse.json({ case: scanCase }, { status: 201 });
  } catch (err) {
    return toSafeErrorResponse(err, "create case");
  }
}
