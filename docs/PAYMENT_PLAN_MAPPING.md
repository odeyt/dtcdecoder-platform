# Payment Plan Mapping (Creem)

This pass did **not** modify checkout, webhook, or product-ID mapping code — the entitlement/pricing overhaul is orthogonal to payment plumbing. Documented here per the audit requirement to confirm the current state before touching anything adjacent to it.

## Current mapping

`src/lib/payments/creem.ts`:
- `productIdFor(plan, interval)` → `env.creemProProductId()` / `creemProYearlyProductId()` / `creemWorkshopProductId()` / `creemWorkshopYearlyProductId()` (all `required()` — throw if unset).
- `planForProductId(productId)` / `intervalForProductId(productId)` → non-throwing optional variants, used by the webhook so an unrecognized product ID doesn't crash the handler.
- `src/app/api/webhooks/creem/route.ts` — verifies `creem-signature` (HMAC-SHA256, timing-safe compare) before parsing; on an unrecognized product ID, **falls back to `plan = "pro"`** rather than rejecting or defaulting to `"free"` (line-level detail worth knowing if a new product is added without updating the optional env vars — it would silently grant Pro-level access, not Workshop or Free).
- `upsertSubscriptionFromWebhook()` (`src/lib/subscriptions.ts`) guards against out-of-order webhook delivery by comparing `current_period_end`; an event older than what's on record is dropped.

## Required environment variables — current state

Confirmed via `vercel env ls` across all environments this session: **none of the four subscription product-ID variables, the Creem API key, or the webhook secret exist in any Vercel environment (Development, Preview, or Production).**

| Variable | Present? | Required by |
|---|---|---|
| `CREEM_API_KEY` | No | `createSubscriptionCheckout` |
| `CREEM_WEBHOOK_SECRET` | No | Webhook signature verification |
| `CREEM_PRO_PRODUCT_ID` | No | `productIdFor("pro", "monthly")` |
| `CREEM_PRO_YEARLY_PRODUCT_ID` | No | `productIdFor("pro", "yearly")` |
| `CREEM_WORKSHOP_PRODUCT_ID` | No | `productIdFor("workshop", "monthly")` |
| `CREEM_WORKSHOP_YEARLY_PRODUCT_ID` | No | `productIdFor("workshop", "yearly")` |
| `CREEM_API_BASE_URL` | Yes (all environments) | Defaults to `https://api.creem.io/v1` even if unset |
| `CREEM_SUCCESS_URL` | Yes (all environments) | Checkout redirect |

**Practical consequence:** checkout (`createSubscriptionCheckout`) and the webhook handler both throw/fail today, in every environment, regardless of this pass's changes. This is a pre-existing condition, not something introduced or fixed here — flagged because it means **no real Creem subscription can currently be created**, so there is no live-subscriber population at risk of being moved to a different price or losing access as a result of this work.

## Existing subscribers

Not applicable — the missing env vars above mean checkout has never been able to complete, so `subscriptions` table rows (if any exist) are not the product of a real completed Creem purchase in this environment. No grandfathering strategy is needed for this pass.

## What's required before checkout can go live

1. Create the four subscription products/prices in the Creem dashboard (Pro monthly/yearly, Workshop monthly/yearly) matching the prices in `docs/PRICING_AND_ENTITLEMENTS.md` ($19/$198, $49/$558).
2. Set the six missing environment variables above in Vercel (scoped to whichever environments should accept real payments).
3. Test checkout end-to-end in Creem's test mode before enabling in Production, per the deployment-safety sequence in `docs/PRICING_PRODUCTION_CHECKLIST.md`.

This is unchanged, pre-existing follow-up work — not newly introduced by the entitlement overhaul.
