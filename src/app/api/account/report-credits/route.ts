import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnusedSingleReportPurchaseCount } from "@/lib/ai-diagnostics/single-report-purchases";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// Lightweight, read-only credit-count check — used only by the account
// page's bounded post-checkout poll (CreditGrantPoller) to detect when the
// Creem webhook has finished granting a purchase. Never a source of
// authorization: nothing here mutates a balance, and the webhook remains
// the sole place a credit is ever granted.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const locale = await resolveAppShellLocale();
    const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;
    return NextResponse.json({ error: t.signInRequired }, { status: 401 });
  }

  const count = await getUnusedSingleReportPurchaseCount(user.id);
  return NextResponse.json({ count });
}
