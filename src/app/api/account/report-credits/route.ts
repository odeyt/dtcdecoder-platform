import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUnusedSingleReportPurchaseCount } from "@/lib/ai-diagnostics/single-report-purchases";

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
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const count = await getUnusedSingleReportPurchaseCount(user.id);
  return NextResponse.json({ count });
}
