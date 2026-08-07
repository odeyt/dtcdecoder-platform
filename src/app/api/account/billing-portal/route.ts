import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnSubscription } from "@/lib/subscriptions";
import { createCustomerPortalLink } from "@/lib/payments/creem";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { env } from "@/lib/env";

// Generates a Creem-hosted billing-portal link for the signed-in user's own
// subscription (payment method + invoices/receipts) — never for
// cancellation, which stays an in-app action (see billing-actions.ts) since
// Creem's in-portal cancel is immediate-only and would contradict this
// app's "retain access until period end" policy.
export async function POST() {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  if (!env.billingEnabled()) {
    return NextResponse.json({ error: t.checkoutNotAvailable }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t.signInRequired }, { status: 401 });

  const subscription = await getOwnSubscription(user.id, user.email ?? null);
  if (!subscription) return NextResponse.json({ error: t.billingPortalNoSubscription }, { status: 404 });
  if (subscription.is_comp) return NextResponse.json({ error: t.billingPortalCompNotice }, { status: 403 });
  if (!subscription.creem_customer_id) {
    return NextResponse.json({ error: t.billingPortalNoCustomerId }, { status: 409 });
  }

  try {
    const portalUrl = await createCustomerPortalLink(subscription.creem_customer_id);
    return NextResponse.json({ portalUrl });
  } catch (err) {
    console.error("[billing] createCustomerPortalLink failed", user.id, err);
    return NextResponse.json({ error: t.unableToOpenBillingPortal }, { status: 500 });
  }
}
