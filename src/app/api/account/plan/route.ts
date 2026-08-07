import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// Lightweight, read-only plan check — used only by SiteNav to decide
// whether to show "Pricing" or "Account" for the signed-in user. The
// subscriptions table has no RLS policy (every access goes through the
// service-role client only, see migration 0003's comment), so the client
// can't resolve this itself the way it resolves auth state; this route is
// the safe read-only bridge, matching report-credits/route.ts's pattern.
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

  const plan = await getEffectivePlan(user.id, user.email ?? null);
  return NextResponse.json({ plan });
}
