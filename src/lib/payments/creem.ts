import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

// Reference: https://docs.creem.io/api-reference/endpoint/create-checkout
// and https://docs.creem.io/code/webhooks
// (fetched directly — REDLINE's own creem-provider.ts is unverified
// placeholder code, marked "TODO: CREEM_INTEGRATION" throughout, and was
// not used as a source of truth here.)

interface CreateCheckoutInput {
  orderId: string;
  email: string;
  priceCents: number;
  creemProductId?: string | null;
}

interface CreemCheckoutResponse {
  id: string;
  checkout_url: string;
}

export async function createOneTimeCheckout(
  input: CreateCheckoutInput,
): Promise<{ checkoutUrl: string; checkoutId: string }> {
  const body: Record<string, unknown> = {
    product_id: input.creemProductId || env.creemGenericProductId(),
    success_url: `${env.creemSuccessUrl()}?order_id=${input.orderId}`,
    customer: { email: input.email },
    metadata: { order_id: input.orderId },
  };

  // custom_price only applies when using the shared generic product —
  // a product with its own dedicated Creem product_id uses that product's
  // configured price instead.
  if (!input.creemProductId) {
    body.custom_price = input.priceCents;
  }

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

export interface CreemWebhookEvent {
  id: string;
  eventType: string;
  object: {
    id: string;
    metadata?: Record<string, string>;
    order?: { id: string; amount: number; currency: string; status: string };
  };
}

export function parseWebhookPayload(rawBody: string): CreemWebhookEvent {
  return JSON.parse(rawBody) as CreemWebhookEvent;
}
