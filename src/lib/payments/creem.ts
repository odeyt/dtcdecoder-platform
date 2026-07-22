import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import type { SubscriptionPlan } from "@/lib/types";
import type { BillingInterval } from "@/lib/pricing";

// Reference: https://docs.creem.io/api-reference/endpoint/create-checkout
// and https://docs.creem.io/code/webhooks
// Subscriptions confirmed supported: billing type lives on the Creem
// *product* (billing_type: "recurring"), not a checkout-time flag. Lifecycle
// webhook events: subscription.active, subscription.paid, subscription.
// trialing, subscription.paused, subscription.update,
// subscription.scheduled_cancel, subscription.canceled, subscription.
// past_due. Exact field names on the subscription object below were not
// independently confirmed against a live payload — verify during sandbox
// testing and adjust CreemWebhookEvent if they differ (same caveat the
// original checkout.expired/failed comment carried).

interface CreateSubscriptionCheckoutInput {
  plan: Extract<SubscriptionPlan, "pro" | "workshop">;
  interval: BillingInterval;
  email: string;
  userId?: string;
}

interface CreemCheckoutResponse {
  id: string;
  checkout_url: string;
}

// Four distinct recurring products in Creem (pro/workshop x monthly/yearly).
// The yearly products must have their own price configured directly in the
// Creem dashboard (12x monthly minus the $30 flat discount, per
// src/lib/pricing.ts) — Creem prices live on the product, not passed here.
function productIdFor(plan: "pro" | "workshop", interval: BillingInterval): string {
  if (plan === "pro") {
    return interval === "yearly" ? env.creemProYearlyProductId() : env.creemProProductId();
  }
  return interval === "yearly"
    ? env.creemWorkshopYearlyProductId()
    : env.creemWorkshopProductId();
}

export async function createSubscriptionCheckout(
  input: CreateSubscriptionCheckoutInput,
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const body = {
    product_id: productIdFor(input.plan, input.interval),
    success_url: env.creemSuccessUrl(),
    customer: { email: input.email },
    // user_id lets the webhook link the resulting subscription back to a
    // signed-in user the same way the old one-time flow linked order_id.
    metadata: {
      plan: input.plan,
      interval: input.interval,
      ...(input.userId ? { user_id: input.userId } : {}),
    },
  };

  const res = await fetch(`${env.creemApiBaseUrl()}/checkouts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.creemApiKey(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Creem checkout creation failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as CreemCheckoutResponse;
  return { checkoutUrl: data.checkout_url, checkoutId: data.id };
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", env.creemWebhookSecret())
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signatureHeader, "hex");

  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export interface CreemSubscriptionObject {
  id: string;
  customer: { id: string; email: string };
  product_id?: string;
  status?: string;
  current_period_end?: string;
  metadata?: Record<string, string>;
}

export interface CreemWebhookEvent {
  id: string;
  eventType: string;
  object: CreemSubscriptionObject;
}

export function parseWebhookPayload(rawBody: string): CreemWebhookEvent {
  return JSON.parse(rawBody) as CreemWebhookEvent;
}

// Non-throwing lookups — the webhook processes every event regardless of
// which of the four products (pro/workshop x monthly/yearly) are actually
// configured yet, so a not-yet-set env var must not crash the whole route.
export function planForProductId(productId: string | undefined): SubscriptionPlan | null {
  if (!productId) return null;
  if (productId === env.creemProProductIdOptional() || productId === env.creemProYearlyProductIdOptional()) {
    return "pro";
  }
  if (
    productId === env.creemWorkshopProductIdOptional() ||
    productId === env.creemWorkshopYearlyProductIdOptional()
  ) {
    return "workshop";
  }
  return null;
}

export function intervalForProductId(productId: string | undefined): BillingInterval {
  if (
    productId &&
    (productId === env.creemProYearlyProductIdOptional() ||
      productId === env.creemWorkshopYearlyProductIdOptional())
  ) {
    return "yearly";
  }
  return "monthly";
}
