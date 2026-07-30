import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSingleReportCheckout, isSingleReportCheckoutConfigured } from "@/lib/payments/creem";
import { env } from "@/lib/env";
import { recordEvent } from "@/lib/analytics/events";

// Professional Diagnostic Report one-time purchase
// (PROFESSIONAL_REPORT_ONE_TIME, src/lib/pricing.ts) — mirrors
// /api/checkout/addon's shape, but there's only one product (no packId
// body param needed) and, unlike add-ons, this is meant to be reachable by
// a Free/no-subscription customer too — see
// src/lib/ai-diagnostics/single-report-purchases.ts for why a purchase
// must still be tied to a real user_id (redemption needs an account to
// hold the unused-purchase row against). The browser sends no body at
// all — every billing detail (product id, price, currency) is resolved
// server-side from the trusted product key baked into this route, never
// from anything the client could submit.
export async function POST() {
  if (!env.billingEnabled()) {
    return NextResponse.json({ error: "Checkout is not available yet" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in to buy a professional report." }, { status: 401 });
  }

  // Explicit "not available yet" rather than letting the request fail deep
  // inside a Creem API call — same rule as /api/checkout/addon.
  if (!isSingleReportCheckoutConfigured()) {
    console.error("Professional Diagnostic Report checkout requested but CREEM_PROFESSIONAL_REPORT_PRODUCT_ID is not configured");
    return NextResponse.json(
      { error: "One-time checkout is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  try {
    const { checkoutUrl } = await createSingleReportCheckout({
      email: user.email,
      userId: user.id,
    });
    await recordEvent("one_time_report_checkout_started", { userId: user.id });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Professional Diagnostic Report checkout creation failed", err);
    await recordEvent("one_time_report_checkout_failed", { userId: user.id });
    return NextResponse.json(
      { error: "One-time checkout is temporarily unavailable. Please try again shortly." },
      { status: 500 },
    );
  }
}
