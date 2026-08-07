import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { ADD_ON_PACKS } from "@/lib/pricing";
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

interface CreemCancelSubscriptionResponse {
  id: string;
  status?: string;
  canceled_at?: string | null;
  current_period_end_date?: string | null;
}

// Schedules cancellation at the end of the current billing period — the
// ONLY mode this app offers (mode: "scheduled"). Creem also supports
// mode: "immediate", but nothing in this app's copy (FAQ/Terms/Refund/
// Subscription & Billing Policy) promises immediate cancellation, and
// calling it would revoke access mid-period with no policy language
// covering that behavior — so it's never called here.
// Reference: https://docs.creem.io/api-reference/endpoint/cancel-subscription
export async function cancelSubscription(
  creemSubscriptionId: string,
): Promise<CreemCancelSubscriptionResponse> {
  const res = await fetch(`${env.creemApiBaseUrl()}/subscriptions/${creemSubscriptionId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.creemApiKey(),
    },
    body: JSON.stringify({ mode: "scheduled" }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Creem subscription cancel failed (${res.status}): ${errText}`);
  }

  return (await res.json()) as CreemCancelSubscriptionResponse;
}

// Reverses a pending scheduled cancellation, back to active. Callers
// (billing-actions.ts) resolve creemSubscriptionId from the signed-in
// user's own subscription row server-side — never from a client-supplied
// id — the same discipline cancelSubscription relies on.
// Reference: https://docs.creem.io/api-reference/endpoint/resume-subscription
export async function resumeSubscription(
  creemSubscriptionId: string,
): Promise<CreemCancelSubscriptionResponse> {
  const res = await fetch(`${env.creemApiBaseUrl()}/subscriptions/${creemSubscriptionId}/resume`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.creemApiKey(),
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Creem subscription resume failed (${res.status}): ${errText}`);
  }

  return (await res.json()) as CreemCancelSubscriptionResponse;
}

interface CreemCustomerPortalResponse {
  customer_portal_link: string;
}

// Returns a Creem-hosted page where the customer updates their payment
// method and views invoices/receipts. Unlike checkout, there's no separate
// Creem *product* involved, so no isXConfigured() gate — the caller (the
// billing-portal route) is responsible for resolving a real
// creem_customer_id from the signed-in user's own subscription row before
// calling this, the same discipline cancelSubscription/resumeSubscription
// already apply to creem_subscription_id.
// Reference: https://docs.creem.io/api-reference/endpoint/create-customer-billing-portal
export async function createCustomerPortalLink(creemCustomerId: string): Promise<string> {
  const res = await fetch(`${env.creemApiBaseUrl()}/customers/billing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.creemApiKey(),
    },
    body: JSON.stringify({ customer_id: creemCustomerId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Creem customer portal link creation failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as CreemCustomerPortalResponse;
  return data.customer_portal_link;
}

interface CreateAddOnCheckoutInput {
  packId: string;
  email: string;
  userId?: string;
}

function productIdForAddOnPack(packId: string): string | undefined {
  if (packId === "addon-10") return env.creemAddon10ProductIdOptional();
  if (packId === "addon-25") return env.creemAddon25ProductIdOptional();
  if (packId === "addon-50") return env.creemAddon50ProductIdOptional();
  return undefined;
}

// Whether checkout for a given add-on pack is actually possible right
// now — false until a real Creem product id is configured for it. Used by
// /api/checkout/addon to return an explicit "not available yet" response
// instead of letting the request fail deep inside a failed API call.
export function isAddOnCheckoutConfigured(packId: string): boolean {
  return Boolean(productIdForAddOnPack(packId));
}

// One-time (non-recurring) checkout — distinct from createSubscriptionCheckout,
// which always creates a recurring product. metadata.pack_id/reports carry
// what the webhook needs to grant the right balance on completion; never
// trust a client-supplied report count over ADD_ON_PACKS' own registry
// value, which is why this function looks it up itself rather than taking
// a report count as a parameter.
export async function createAddOnCheckout(
  input: CreateAddOnCheckoutInput,
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const pack = ADD_ON_PACKS.find((p) => p.id === input.packId);
  if (!pack) throw new Error(`Unknown add-on pack id: ${input.packId}`);

  const productId = productIdForAddOnPack(input.packId);
  if (!productId) {
    throw new Error(`Add-on pack "${input.packId}" has no configured Creem product id yet`);
  }

  const body = {
    product_id: productId,
    success_url: env.creemSuccessUrl(),
    customer: { email: input.email },
    metadata: {
      pack_id: pack.id,
      reports: String(pack.reports),
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

interface CreateSingleReportCheckoutInput {
  email: string;
  userId?: string;
}

// Whether checkout for the Professional Diagnostic Report one-time
// purchase is actually possible right now — false until a real Creem
// product id is configured, same "not available yet" rule as the add-on
// packs.
export function isSingleReportCheckoutConfigured(): boolean {
  return Boolean(env.creemProfessionalReportProductIdOptional());
}

// One-time checkout for PROFESSIONAL_REPORT_ONE_TIME (src/lib/pricing.ts)
// — a standalone product, not one of ADD_ON_PACKS. The browser only ever
// submits the trusted product key; this function independently resolves
// the Creem product id server-side and never accepts a price, currency,
// or product id from the caller. metadata carries product_key/purchase_type
// so the webhook can recognize this event type without trusting anything
// else the client sent.
export async function createSingleReportCheckout(
  input: CreateSingleReportCheckoutInput,
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const productId = env.creemProfessionalReportProductIdOptional();
  if (!productId) {
    throw new Error("Professional Diagnostic Report purchase has no configured Creem product id yet");
  }

  const body = {
    product_id: productId,
    success_url: env.creemSuccessUrl(),
    customer: { email: input.email },
    metadata: {
      product_key: "professional_report_one_time",
      purchase_type: "one_time_report",
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
  // Optional: a one-time checkout.completed event's object (add-on packs —
  // see addonPackForProductId below) isn't guaranteed to carry the same
  // nested customer shape as a subscription event; this app never reads
  // `customer` for that event type, only `product_id`/`metadata`.
  customer?: { id: string; email: string };
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

// Reverse lookup for the webhook — returns the full registry entry (not
// just the id) so the caller can grant reports/pack_id straight from
// ADD_ON_PACKS rather than trusting a client-supplied metadata value for
// either. Returns null for any product id that isn't a currently
// configured add-on pack (including every pack until real product ids
// exist — see isAddOnCheckoutConfigured).
export function addonPackForProductId(productId: string | undefined) {
  if (!productId) return null;
  if (productId === env.creemAddon10ProductIdOptional()) return ADD_ON_PACKS.find((p) => p.id === "addon-10") ?? null;
  if (productId === env.creemAddon25ProductIdOptional()) return ADD_ON_PACKS.find((p) => p.id === "addon-25") ?? null;
  if (productId === env.creemAddon50ProductIdOptional()) return ADD_ON_PACKS.find((p) => p.id === "addon-50") ?? null;
  return null;
}

// Reverse lookup for the webhook, parallel to addonPackForProductId above
// — a standalone product, not a member of ADD_ON_PACKS, so it gets its
// own boolean check rather than a registry-entry lookup. The webhook route
// also cross-checks metadata.product_key === "professional_report_one_time"
// before granting — this function alone decides which Creem product id
// counts, never a client-supplied value.
export function isSingleReportProductId(productId: string | undefined): boolean {
  if (!productId) return false;
  return productId === env.creemProfessionalReportProductIdOptional();
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
