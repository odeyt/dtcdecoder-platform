import { NextResponse, type NextRequest } from "next/server";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  planForProductId,
  intervalForProductId,
  addonPackForProductId,
} from "@/lib/payments/creem";
import { upsertSubscriptionFromWebhook } from "@/lib/subscriptions";
import { grantAddOnPack } from "@/lib/ai-diagnostics/addon-balances";

export async function POST(request: NextRequest) {
  // Read the raw body — verification must happen against the exact bytes
  // Creem signed, before any JSON parsing.
  const rawBody = await request.text();
  const signature = request.headers.get("creem-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event;
  try {
    event = parseWebhookPayload(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  // One-time add-on-report-pack purchase completion — a distinct event
  // type from the subscription lifecycle below (checkout.completed vs
  // subscription.*), handled first since it doesn't rely on `customer`
  // being present the way a subscription event does. Event shape recovered
  // from this app's pre-pivot one-time-checkout webhook (git history,
  // commit a84d124^), which fetched it directly from Creem's docs — only
  // "checkout.completed" was ever confirmed there; "checkout.expired"/
  // "checkout.failed" were not, so there's no failure-path handling here
  // (same caveat the original code carried, and moot anyway while add-on
  // checkout stays disabled — see /api/checkout/addon).
  if (event.eventType === "checkout.completed") {
    const checkoutObject = event.object;
    const pack = addonPackForProductId(checkoutObject.product_id);
    const userId = checkoutObject.metadata?.user_id;

    if (!pack || !userId) {
      // Not an add-on-pack checkout we recognize (wrong/unset product id,
      // or missing the user_id metadata this app always sets at checkout
      // creation) — acknowledge so Creem doesn't retry indefinitely, but
      // don't pretend anything was granted.
      console.error("checkout.completed webhook unrecognized as an add-on-pack purchase", event.id);
      return NextResponse.json({ received: true });
    }

    try {
      await grantAddOnPack({
        userId,
        packId: pack.id,
        reports: pack.reports,
        creemOrderId: checkoutObject.id,
      });
    } catch (err) {
      console.error("Failed to grant add-on pack", pack.id, userId, err);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }

    return NextResponse.json({ received: true });
  }

  const subscription = event.object;
  const plan = planForProductId(subscription.product_id) ?? "pro";
  const interval = intervalForProductId(subscription.product_id);
  const userId = subscription.metadata?.user_id ?? null;

  // Every subscription lifecycle event (unlike checkout.completed, handled
  // above) is confirmed to carry a customer — see the file-header comment.
  if (!subscription.customer) {
    console.error("Subscription webhook missing customer", event.eventType, event.id);
    return NextResponse.json({ received: true });
  }

  const base = {
    creemSubscriptionId: subscription.id,
    creemCustomerId: subscription.customer.id,
    email: subscription.customer.email,
    userId,
    plan,
    interval,
    currentPeriodEnd: subscription.current_period_end ?? null,
  };

  try {
    switch (event.eventType) {
      case "subscription.active":
      case "subscription.paid":
        await upsertSubscriptionFromWebhook({ ...base, status: "active" });
        break;

      case "subscription.past_due":
        await upsertSubscriptionFromWebhook({ ...base, status: "past_due" });
        break;

      case "subscription.canceled":
        await upsertSubscriptionFromWebhook({ ...base, status: "canceled" });
        break;

      default:
        // trialing / paused / update / scheduled_cancel — acknowledged, no
        // state transition applied for these in v1.
        break;
    }
  } catch (err) {
    console.error("Failed to process Creem subscription webhook", event.eventType, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
