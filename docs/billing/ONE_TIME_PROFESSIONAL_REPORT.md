# Professional Diagnostic Report — One-Time Purchase

Rebrand, reprice, and hardening pass over the existing single-report-purchase
mechanism (originally shipped as "Buy 1 report — $9.99", migration `0037`).
This document covers the feature as it exists after this pass — product,
checkout, webhook, entitlements, follow-up/regeneration limits, retention,
dashboard, localization, analytics, and tests.

## Product

| Field | Value |
|---|---|
| Product key (stable, client-facing) | `professional_report_one_time` |
| Name | Professional Diagnostic Report |
| Real checkout price | **$6.99 USD** (introductory) |
| Reference price (marketing only, never charged) | $9.99 USD |
| Follow-ups included | 5 (DTC Technician™ questions scoped to the purchased case) |
| Regenerations included | 1 (final-report re-run) |
| View window | 30 days from redemption (see **Retention** below) |

Defined in `src/lib/pricing.ts` as `PROFESSIONAL_REPORT_ONE_TIME` (typed
`OneTimeReportOffer`). The card component (`src/components/OneTimeReportCard.tsx`)
formats both prices from this single object via `formatPrice()`
(`src/lib/format.ts`) — the literal strings `$6.99`/`$9.99` are never
duplicated anywhere else in customer-facing code.

**The real charged price lives on the Creem product itself**, not in this
app. This app only ever sends a `product_id` to Creem's checkout-creation
API — it never sends a price. Before the $6.99 introductory price is real,
the Creem product referenced by `CREEM_PROFESSIONAL_REPORT_PRODUCT_ID` must
itself be configured (in the Creem dashboard) to charge $6.99.

## Env var

```
CREEM_PROFESSIONAL_REPORT_PRODUCT_ID=<creem product id>
```

Optional/non-throwing (`env.creemProfessionalReportProductIdOptional()`).
While unset, checkout for this product returns `503` with a recoverable
message ("One-time checkout is temporarily unavailable. Please try again
shortly.") — no fallback to a subscription, no fabricated success.

## UI

### Problem being fixed

The old card (`PricingPlans.tsx`) was a separate, narrower block
(`glass-panel mx-auto max-w-xl ... text-center`) sitting below the
3-column subscription grid, visually detached from it, with a single
centered paragraph + button and no real feature list.

### Root cause

The card's own `max-w-xl mx-auto` was the sole width constraint — no other
nested `max-w-*`/`container` classes existed in the file, and the page's
main `.container-app` responsive container was never the problem.

### Fix

New `src/components/OneTimeReportCard.tsx` replaces the old block. It has
no independent max-width or centering wrapper — it renders at the same
outer width as `.container-app` provides, exactly like the subscription
grid above it, so their left/right edges line up.

Layout:
- **Desktop** (`md:` and up): two-column grid (`md:grid-cols-[1.3fr_1fr]`).
  Left: eyebrow, heading, description, 8-item feature list. Right
  (vertically centered): crossed-out reference price, prominent current
  price, "Introductory price" badge, CTA, supporting text, fair-use note.
- **Tablet**: same two-column layout while there's room; the grid naturally
  stacks to one column before it gets cramped (verified at 768×1024).
- **Mobile**: single column, full-width CTA matching the subscription
  cards' own button width, ≥44px touch target.

Verified at 1440×900, 1024×768, 768×1024, 390×844, 360×800 via
`tests/e2e/smoke/one-time-report-card.spec.ts` (bounding-box alignment
against `[data-testid="pricing-plans-grid"]`, no horizontal overflow, no
console errors, keyboard focus).

`data-testid`s: `pricing-plans-grid`, `one-time-report-card`,
`one-time-report-reference-price`, `one-time-report-price`,
`one-time-report-cta`, `one-time-report-features`.

## Checkout

`POST /api/checkout/single-report` — the browser sends **no body at all**.
Every billing detail (product id, price, currency) is resolved server-side:

- Auth required (`401` if not signed in).
- `env.billingEnabled()` and `isSingleReportCheckoutConfigured()` gate the
  request before any Creem call.
- `createSingleReportCheckout()` (`src/lib/payments/creem.ts`) reads the
  product id from `env.creemProfessionalReportProductIdOptional()` only —
  never from anything client-supplied — and sends
  `metadata: { product_key: "professional_report_one_time", purchase_type: "one_time_report", user_id }`.
- Never trusts client-submitted price, currency, product id, user id, or
  credit quantity — there is nothing in the request body to trust in the
  first place.

### Unauthenticated flow

`OneTimeReportCard` renders a sign-in link
(`/account/login?next=%2Fpricing%3Fstart_checkout%3Dprofessional_report_one_time`)
instead of a button when signed out. The `next` value is validated as an
internal-only relative path by the existing login machinery — nothing new
was added for this, the same validator already used by the password-login
and magic-link flows:
- `src/app/(app)/account/auth/callback/route.ts`'s `safeNextPath()` (magic
  link return path).
- `PasswordLoginForm.tsx`'s matching client-side check.

Once signed in and returned to `/pricing?start_checkout=professional_report_one_time`,
`OneTimeReportCard` detects the query param and automatically resumes
checkout (one-shot, guarded by a ref so it never re-fires).

### CTA states

Default → "Get one professional report". Loading → "Preparing secure
checkout…", button `disabled` + `aria-busy="true"` (prevents duplicate
clicks). On failure: button re-enables, an accessible `role="alert"`
error appears, state is preserved (retryable), and the message is always
the sanitized server string — never a raw error object.

## Webhook

`POST /api/webhooks/creem` (`src/app/api/webhooks/creem/route.ts`) —
audited and extended, not rewritten:

1. Signature verified against the raw body before any parsing
   (`verifyWebhookSignature`, HMAC-SHA256, `crypto.timingSafeEqual`).
   Invalid signature → `401`, nothing touched.
2. `checkout.completed` events are checked first for
   `isSingleReportProductId(product_id)` (server-configured product id —
   never client-supplied).
3. **New in this pass**: if `metadata.product_key` is present, it must
   equal `"professional_report_one_time"` or the event is acknowledged
   (`{received:true}`) but nothing is granted — a defense-in-depth check
   independent of the product-id match.
4. Missing `user_id` metadata → acknowledged, nothing granted, logged.
5. `grantSingleReportPurchase()` calls `grant_single_report_purchase` (a
   `security definer` RPC), idempotent on `creem_order_id` via a partial
   unique index (migration `0037`) — a webhook retry for the same order
   never grants a second credit.
6. Canceled/failed/refunded/unrelated events: no code path in this router
   grants a credit for anything other than a recognized `checkout.completed`
   event for this exact product id — every other event type either updates
   subscription state (subscription lifecycle events) or is acknowledged
   with no state change.

The webhook remains the **sole** place a credit is ever granted. Nothing in
the checkout-return flow (`?checkout=success`) grants a credit — see
**Dashboard** below.

## Entitlements / credit model

Reuses the existing `single_report_purchases` table (migration `0037`) —
no new table. One credit = one row with `status='unused'`. Redemption
(`redeem_single_report_purchase`, called from
`src/lib/scan-diagnostics/analyze.ts`'s `runScanAnalysis`) atomically
claims the user's oldest unused row (`for update skip locked`), sets
`status='consumed'`, `case_id`, and `expires_at = now() + 30 days`.

**One credit = one case, regardless of DTC count.** Redemption happens
once, at the moment a case's analysis is first run (`runScanAnalysis`) —
a case can carry any number of related DTCs from the same scan; nothing
in this codebase ever redeems per-DTC. No code change was needed for this
requirement — it was already true.

**Atomic, race-safe consumption.** `redeem_single_report_purchase` uses
`for update skip locked` so two concurrent requests for the same user can
never redeem the same purchase twice.

**Credit consumption never happens on**: checkout start/cancel, form-open,
validation/VIN/upload failure, provider failure before a report exists,
page refresh, reopening a saved case, or viewing/downloading a report — the
redemption call site is `runScanAnalysis`'s AI-generation path only, guarded
by the case's own status-transition machine (`ready_for_analysis`/`failed`
→ `analyzing`), which a page view or a failed pre-analysis step never
reaches.

### Follow-up limit (5) and regeneration limit (1) — new in this pass

Migration `0043_professional_report_usage_limits.sql` adds
`followup_count`/`regeneration_count` columns to `single_report_purchases`
plus two atomic RPCs:

- `consume_report_followup(case_id, max_followups)`
- `consume_report_regeneration(case_id, max_regenerations)`

Both are a single `UPDATE ... WHERE ... AND count < max RETURNING id` —
the `WHERE` clause is re-evaluated against the committed row when the row
lock is acquired, so two concurrent requests for the same case can never
both succeed once the limit is reached. Limits themselves
(`PROFESSIONAL_REPORT_ONE_TIME.maxFollowUps` / `.maxRegenerations`) are
passed in from application code, not hardcoded in SQL.

TypeScript wrappers: `consumeReportFollowUp`, `consumeReportRegeneration`,
`getReportUsageStatus` (`src/lib/ai-diagnostics/single-report-purchases.ts`).

**Follow-ups**: wired into `POST /api/ai/assistant` (the DTC Technician
chat endpoint). The request body gained an optional `caseId` field. When
present, the route verifies case ownership, checks for an active purchase
unlock (`getActiveSingleReportUnlock`), and — only if unlocked — atomically
consumes a follow-up before the usual usage-gate/generation logic runs. A
case with no purchase unlock is never gated by this at all (this limit
only ever applies to a purchased case's follow-ups, never general DTC
Technician usage). The 6th attempt returns `409` with
`{error, code: "FollowUpLimitExceededError"}`; the case, report, and prior
consultation history are untouched.

**Regeneration**: new `POST /api/scan-diagnostics/cases/[caseId]/regenerate`
route (`src/app/api/scan-diagnostics/cases/[caseId]/regenerate/route.ts`),
calling a new `regenerateScanAnalysis()` in `analyze.ts`. This did not
exist before this pass — the original `/analyze` route's status-transition
guard only ever allows `ready_for_analysis`/`failed` → `analyzing`, so a
completed case could never be re-analyzed at all. `regenerateScanAnalysis`:
1. Requires an active purchase unlock (`getActiveSingleReportUnlock`) —
   regeneration is a purchased-report benefit only, never available on a
   plan-based report.
2. Atomically consumes the regeneration allowance
   (`consumeReportRegeneration`) **before** touching the case at all — if
   this returns `false`, `RegenerationLimitExceededError` is thrown and
   neither the case status nor the existing report changes.
3. Re-runs `runScanAnalysis` with `{ skipUsageGate: true, fromStatuses: "completed" }`
   — no new usage-gate reservation, no new purchase redemption; the case
   transitions `completed → analyzing → completed` again with a fresh
   report.

The 2nd regeneration attempt is blocked (`409`,
`code: "RegenerationLimitExceededError"`), preserving the first
regeneration's report.

## Retention

**No change to actual retention behavior** — verified honest instead.
`src/lib/scan-diagnostics/retention.ts`'s 90-day sweep only ever targets a
`completed` case owned by a user whose **current subscription** is active
pro/workshop, and explicitly excludes any case with an active single-report
unlock. A Free-tier buyer's case (the primary target market for this
one-time purchase) is **never** touched by the sweep regardless of age —
nothing is ever auto-deleted after 30 days.

The 30-day figure (`PROFESSIONAL_REPORT_ONE_TIME.viewWindowDays`) governs
only the **view-access unlock window**, not deletion: after it lapses,
`resolveReportAccess` falls back to the buyer's plan-derived access level
(preview, for a still-Free-tier buyer) — the case/report data itself is
never deleted. The card's copy was changed accordingly: the old
"Viewable for 30 days" claim is removed from customer-facing copy; the new
copy is "Saved to your account" (true — the record persists) plus a
fair-use note. **Known nuance, documented rather than hidden**: a Free-tier
buyer who doesn't upgrade will see the purchased report drop back to
preview-level detail after 30 days even though the case itself still
exists in their account — see **Remaining Risks** in the implementation
report for the honest framing of this.

## Dashboard

Account page (`src/app/(app)/account/(protected)/page.tsx`) — new
"Professional report credits" panel, shown to every plan (unlike add-on
packs, which are paid-plan only) whenever `getUnusedSingleReportPurchaseCount(userId) > 0`:
"N available" + "Start diagnostic report" CTA → `/diagnostics/upload`.

Post-checkout return (`?checkout=success`, see `CreditGrantPoller.tsx`):
shows "Payment received. Your report credit will appear shortly." and
polls a read-only endpoint (`GET /api/account/report-credits`) every 3s,
up to 10 attempts (bounded — falls back to a "still confirming" message
rather than polling forever), then `router.refresh()`s once the count
increases. **The poller never grants anything** — it only detects when the
webhook (the sole grant path) has caught up. `CREEM_SUCCESS_URL` should
point at `/account?checkout=success` for this to trigger (see `.env.example`).

## Localization

All new/changed customer-facing strings added to `messages/en.json` and
propagated to all 11 other locale files (es, de, fr, ja, km, ko, lo,
pt-BR, th, vi, zh-CN) with real (not machine-stub) translations — key
parity verified programmatically (every locale has exactly the same key
set as `en.json` in both the `pricing` and `account` namespaces).

Pricing-namespace keys: `oneTimeEyebrow`, `oneTimeHeading`,
`oneTimeDescription`, `oneTimeFeature1`–`8`, `oneTimeIntroductoryLabel`,
`oneTimeCta`, `oneTimeCheckoutLoading`, `oneTimeSupportingText`,
`oneTimeFairUseNote`.

Account-namespace keys: `oneTimeCreditsTitle`, `oneTimeCreditsAvailable`,
`startReport`, `paymentProcessing`, `paymentProcessingDelayed`,
`paymentReceived`.

The old `singleReportHeading`/`singleReportBody`/`singleReportCta` keys
(and their literal, non-interpolated `$9.99` text) were removed from every
locale file — no customer-facing English/hardcoded price remains.

## Accessibility

Heading hierarchy: card heading is an `<h2>`, sibling to each subscription
plan card's own `<h2>` (not nested under one). Discount is never
color-only: the crossed-out reference price uses `line-through` (a
non-color signal) alongside the red accent, plus an explicit "Introductory
price" text label. CTA has visible focus (global `:focus-visible` rule,
unchanged), `aria-busy` during checkout creation, a `role="alert"` live
region for errors. Decorative checkmark icons are `aria-hidden="true"`.
Touch targets are `min-h-11` (44px) everywhere. Reduced-motion is handled
by the existing sitewide `@media (prefers-reduced-motion: reduce)` rule —
no new animation was introduced.

## Analytics

New event types in `src/lib/analytics/events.ts`:
`one_time_report_offer_viewed`, `_checkout_started`, `_checkout_failed`,
`_checkout_returned`, `_credit_granted`, `_case_started`,
`_credit_consumed`, `_followup_limit_reached`. Metadata stays limited to
plan/user id — never VIN, symptoms, scan contents, email, payment details,
or report text.

**Requires migration `0044`** to widen the `analytics_events` table's
`event_type` CHECK constraint — until applied, these events fail to
persist (caught and logged, never thrown; the app is unaffected, but the
events won't appear in the ledger).

## Tests

- `test/pricing.test.ts` — `PROFESSIONAL_REPORT_ONE_TIME` shape/price/limits.
- `test/single-report-purchases.test.ts` — grant/redeem (existing) plus new
  `consumeReportFollowUp`/`consumeReportRegeneration`/`getReportUsageStatus`/
  `getUnusedSingleReportPurchaseCount` coverage, including the "5 allowed,
  6th blocked" and "1 allowed, 2nd blocked" cases.
- `test/scan-analyze-route.test.ts` — new `regenerateScanAnalysis` describe
  block: no-unlock rejection, one successful regeneration with no new usage
  slot consumed, second-attempt rejection.
- `test/payments-creem-professional-report.test.ts` — env-var-gated
  `isSingleReportCheckoutConfigured`/`isSingleReportProductId`.
- `test/creem-webhook-professional-report.test.ts` — signature rejection,
  successful grant, idempotent duplicate delivery, missing `user_id`,
  `product_key` mismatch, unrelated product id.
- `test/one-time-report-card.test.tsx` — testids/price/features render,
  signed-out sign-in link with preserved return intent, signed-in checkout
  loading/redirect, retryable accessible error, auto-resume after
  sign-in-return.
- `tests/e2e/smoke/one-time-report-card.spec.ts` — Playwright, all 5
  required viewports: grid/card bounding-box alignment, no horizontal
  overflow, price hierarchy, feature count, CTA visibility + keyboard
  focus, no console errors.

## Required configuration (names only — see the codebase's own docs for how
each is normally set; no values are recorded here)

- `CREEM_PROFESSIONAL_REPORT_PRODUCT_ID`
- `CREEM_SUCCESS_URL` (should point at `/account?checkout=success`)
- Apply migrations `0043_professional_report_usage_limits.sql` and
  `0044_one_time_report_analytics_events.sql` to the target Supabase
  project (same manual-apply workflow as every prior migration in this
  repo).

## Rollback

Every change here is additive:
- New migrations add columns/constraints, they don't drop or rewrite
  existing ones.
- The env var defaults to unset, which already safely disables checkout
  for this product (`isSingleReportCheckoutConfigured()` returns false).
- Reverting the card/component changes is a pure code revert — no data
  migration is needed either direction.
- If `CREEM_PROFESSIONAL_REPORT_PRODUCT_ID` is never set, the feature is
  fully inert (checkout returns 503, nothing else changes) — equivalent to
  not having shipped this pass at all from a user-facing standpoint, except
  for the redesigned (still-functional-once-configured) card UI.
