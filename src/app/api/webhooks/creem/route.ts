import { NextResponse, type NextRequest } from "next/server";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
  planForProductId,
  intervalForProductId,
} from "@/lib/payments/creem";
import { upsertSubscriptionFromWebhook } from "@/lib/subscriptions";

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

  const subscription = event.object;
  const plan = planForProductId(subscription.product_id) ?? "pro";
  const interval = intervalForProductId(subscription.product_id);
  const userId = subscription.metadata?.user_id ?? null;

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
