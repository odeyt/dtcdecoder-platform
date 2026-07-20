# Creem Integration Readiness

## Confirmed behavior (from code)

- **Checkout route** ([src/app/api/checkout/route.ts](../../src/app/api/checkout/route.ts)): validates input with Zod, checks the product is published, creates a `pending` order via the service-role client, calls Creem to create a one-time checkout session, attaches the returned `checkout_id` to the order, returns the checkout URL. Gated first by `env.billingEnabled()` — returns `503 {"error":"Checkout is not available yet"}` immediately when `NEXT_PUBLIC_BILLING_ENABLED` is not `"true"`. Verified locally via `curl` — confirmed 503, no crash.
- **API authentication**: `x-api-key: env.creemApiKey()` header on the checkout-creation request ([src/lib/payments/creem.ts](../../src/lib/payments/creem.ts)).
- **Webhook route** ([src/app/api/webhooks/creem/route.ts](../../src/app/api/webhooks/creem/route.ts)): reads the **raw** request body via `request.text()` before any JSON parsing, verifies `creem-signature` against an HMAC-SHA256 of that raw body using `CREEM_WEBHOOK_SECRET`, compares with `crypto.timingSafeEqual` (constant-time, not vulnerable to timing attacks). Rejects with `401` on missing/invalid signature before any further processing.
- **Idempotency**: `markOrderPaidIfNotAlready()` relies on the `orders.provider_event_id` unique constraint and a `WHERE provider_event_id IS NULL` guard — a duplicate webhook delivery for the same event affects 0 rows instead of double-applying the paid state.
- **Order status updates**: `checkout.completed` → marks paid; `checkout.expired` / `checkout.failed` → marks failed. Unknown event types fall through and return `{"received": true}` without changing any order state — safe default.
- **Success page** ([src/app/checkout/success/page.tsx](../../src/app/checkout/success/page.tsx)): reads order status and displays a "confirming payment" / "not completed" / "you're all set" state accordingly. It only **reads** — it never writes `status = paid`. Payment confirmation happens exclusively via the webhook. Verified by code inspection: no write path exists between visiting this page and gaining download access.
- **Download authorization**: independent of Creem entirely — `verifyPurchaseAndGetFile()` requires the order's `status = 'paid'` (only settable by the webhook) and `user_id` matching the requester before issuing a signed URL.

## Unconfirmed behavior (flagged in the code itself)

The webhook handler has an inline comment noting that only `checkout.completed` was verified against Creem's actual docs — `checkout.expired` / `checkout.failed` event-type names are **not confirmed** and should be checked against the real event log in the Creem dashboard during sandbox testing before relying on them. This audit did not invent or assume additional Creem behavior beyond what's in the code and its cited doc references (`docs.creem.io/api-reference/endpoint/create-checkout`, `docs.creem.io/code/webhooks`).

## Variables required for checkout to actually work

`CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_GENERIC_PRODUCT_ID`, `CREEM_API_BASE_URL`, `CREEM_SUCCESS_URL` — see [environment-matrix.md](environment-matrix.md) for current status. All three secrets are currently **placeholder locally and missing in Vercel**.

## Current billing status

`NEXT_PUBLIC_BILLING_ENABLED=false` everywhere (local, Vercel Production/Preview/Development). This is the correct, safe default per the deployment brief: the site deploys and browses fully with billing off, checkout shows a safe unavailable state, no crash, no fake purchase possible.

## Test Mode setup (owner action, when ready)

1. In the Creem dashboard, confirm you're in **sandbox/test mode** (not live).
2. Create the one generic one-time-payment product for DTCDecoder → copy its product ID → `CREEM_GENERIC_PRODUCT_ID`.
3. Copy your sandbox API key → `CREEM_API_KEY`.
4. Create a webhook endpoint pointing at `https://dtcdecoder.com/api/webhooks/creem` (or the Vercel preview URL for earlier testing) → copy its signing secret → `CREEM_WEBHOOK_SECRET`.
5. Add all three to Vercel (Production/Preview/Development as appropriate) — directly in the dashboard, not through this session.
6. Set `CREEM_API_BASE_URL=https://test-api.creem.io/v1` (already set).
7. Only then, with `NEXT_PUBLIC_BILLING_ENABLED` still `false`, redeploy and test the full checkout → webhook → download flow using Creem's sandbox checkout UI.
8. Once a full sandbox purchase → paid order → signed download works end-to-end, flip `NEXT_PUBLIC_BILLING_ENABLED=true` for a controlled test in Preview before Production.

## Live Mode activation checklist (explicit owner approval required — not done automatically)

- [ ] Sandbox flow fully verified end-to-end (checkout, webhook, paid status, download).
- [ ] Swap `CREEM_API_BASE_URL` to `https://api.creem.io/v1`.
- [ ] Swap `CREEM_API_KEY` to the live key.
- [ ] Create a **live-mode** webhook in Creem pointing at `https://dtcdecoder.com/api/webhooks/creem`, and swap `CREEM_WEBHOOK_SECRET` to its live signing secret.
- [ ] Confirm the live `CREEM_GENERIC_PRODUCT_ID`.
- [ ] Set `NEXT_PUBLIC_BILLING_ENABLED=true` in Vercel Production only after all of the above, and only with your explicit go-ahead.

This audit did not flip billing on and did not touch live payment configuration.
