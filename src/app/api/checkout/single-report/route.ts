import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSingleReportCheckout, isSingleReportCheckoutConfigured } from "@/lib/payments/creem";
import { env } from "@/lib/env";

// Standalone $9.99 single-report purchase (SINGLE_REPORT_PURCHASE,
// src/lib/pricing.ts) — mirrors /api/checkout/addon's shape, but there's
// only one product (no packId body param needed) and, unlike add-ons,
// this is meant to be reachable by a Free/no-subscription customer too —
// see src/lib/ai-diagnostics/single-report-purchases.ts for why a
// purchase must still be tied to a real user_id (redemption needs an
// account to hold the unused-purchase row against).
export async function POST() {
  if (!env.billingEnabled()) {
    return NextResponse.json({ error: "Checkout is not available yet" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in to buy a single report." }, { status: 401 });
  }

  // Explicit "not available yet" rather than letting the request fail deep
  // inside a Creem API call — same rule as /api/checkout/addon.
  if (!isSingleReportCheckoutConfigured()) {
    return NextResponse.json(
      { error: "Single-report purchases aren't available yet." },
      { status: 503 },
    );
  }

  try {
    const { checkoutUrl } = await createSingleReportCheckout({
      email: user.email,
      userId: user.id,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Single-report checkout creation failed", err);
    return NextResponse.json({ error: "Unable to start checkout right now" }, { status: 500 });
  }
}
