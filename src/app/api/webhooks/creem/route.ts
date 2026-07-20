import { NextResponse, type NextRequest } from "next/server";
import {
  verifyWebhookSignature,
  parseWebhookPayload,
} from "@/lib/payments/creem";
import { markOrderPaidIfNotAlready, markOrderFailed } from "@/lib/orders";

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

  const orderId = event.object?.metadata?.order_id;

  if (event.eventType === "checkout.completed") {
    if (!orderId) {
      // Nothing we can reconcile this against — acknowledge so Creem
      // doesn't retry indefinitely, but don't pretend it succeeded.
      console.error("checkout.completed webhook missing metadata.order_id", event.id);
      return NextResponse.json({ received: true });
    }

    try {
      await markOrderPaidIfNotAlready(orderId, event.id);
    } catch (err) {
      console.error("Failed to mark order paid", orderId, err);
      return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
  } else if (
    // NOTE: "checkout.expired" / "checkout.failed" are not confirmed in
    // Creem's docs (only checkout.completed was verified) — check the
    // actual event names in your Creem dashboard's webhook log during
    // sandbox testing and adjust these if they differ.
    event.eventType === "checkout.expired" ||
    event.eventType === "checkout.failed"
  ) {
    if (orderId) {
      try {
        await markOrderFailed(orderId);
      } catch (err) {
        console.error("Failed to mark order failed", orderId, err);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
