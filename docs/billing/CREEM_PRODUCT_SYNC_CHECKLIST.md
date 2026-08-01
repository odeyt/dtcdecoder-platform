# Creem Product Sync Checklist

Prices, report allowances, and seat counts live in **two places that nothing
keeps in sync**:

1. `src/lib/pricing.ts` — what the site advertises, and what the app actually
   enforces at runtime.
2. **The Creem dashboard** — what the customer is actually charged, and the
   product name/description shown on the checkout page.

This app never sends a price to Creem. `createSubscriptionCheckout()` and
`createSingleReportCheckout()` (`src/lib/payments/creem.ts` — still named for
the pre-rebrand "single report") send only a `product_id`; the amount and the
billing period live on the Creem product itself. So a price change in `pricing.ts` changes the *advertised* price and
nothing else — the charge only changes when the Creem product changes.

`src/components/PricingPlans.tsx` already carries this warning in a comment:
the bullet copy is hand-synced to `pricing.ts` and there is no automated check
tying the two together. This checklist is the manual gate that fills that gap.

Run it **every time** any of these change: a plan price, a report allowance,
a seat count, a daily cap, the yearly discount, or an introductory price.

## Why this exists

Both failure modes below have already happened in production:

- **Prices drifted.** The site advertised $39/mo and $390/yr while Creem
  charged $19/mo and $198/yr — roughly half. Customers were undercharged for
  an unknown period; the mismatch was invisible from inside the app, because
  the app never sees the charged amount.
- **Descriptions drifted.** Creem product text promised "30 reports per month
  (max 5/day)" for Pro and "120 per month (max 15/day)" for Workshop, against
  a real entitlement of 20 and 75 with no daily cap at all (the caps were
  removed for paid plans). Creem was over-promising by ~50% on the exact
  number a customer would later hit a wall on.

Neither is caught by `npx tsc`, `npm run lint`, `npx vitest run`, or
`npm run build`. Only this checklist catches them.

## The five products

| Product | Env var (Vercel) | Source of truth in `pricing.ts` |
|---|---|---|
| Pro Technician Monthly | `CREEM_PRO_PRODUCT_ID` | `PAID_PLANS.pro.monthlyPriceUsd` |
| Pro Technician Yearly | `CREEM_PRO_YEARLY_PRODUCT_ID` | `PAID_PLANS.pro.yearlyPriceUsd` |
| Workshop Monthly | `CREEM_WORKSHOP_PRODUCT_ID` | `PAID_PLANS.workshop.monthlyPriceUsd` |
| Workshop Yearly | `CREEM_WORKSHOP_YEARLY_PRODUCT_ID` | `PAID_PLANS.workshop.yearlyPriceUsd` |
| Professional Diagnostic Report | `CREEM_PROFESSIONAL_REPORT_PRODUCT_ID` | `PROFESSIONAL_REPORT_ONE_TIME` |

Add-on report packs (`CREEM_ADDON_{10,25,50}_PRODUCT_ID`) have no real Creem
products yet; their checkout stays disabled until they do. Include them here
once they go live.

**Env var names must match `src/lib/env.ts` exactly.** A near-miss name is
indistinguishable from "not configured": the accessor returns `undefined`, the
route's `isConfigured()` guard trips, and the customer sees
"temporarily unavailable" with no other signal. This has also already happened
— the code was renamed to `CREEM_PROFESSIONAL_REPORT_PRODUCT_ID` while Vercel
still held `CREEM_SINGLE_REPORT_PRODUCT_ID`, silently disabling one-time
checkout in production.

## Checklist

### 1. Change `pricing.ts` first

It is the source of truth for everything the site displays and enforces.

### 2. Update every affected Creem product

For each of the five, check **all four**:

- [ ] **Price** matches its `pricing.ts` figure exactly
- [ ] **Billing period** is right (`/month` vs `/year`) — a yearly product
      priced per month is the worst outcome here, and the app cannot detect it
- [ ] **Report allowance** in the description matches
      `AI_DIAGNOSTIC_ENTITLEMENTS[plan].fullDiagnosticMonthlyLimit`
- [ ] **No daily cap** is mentioned unless
      `fullDiagnosticDailyLimit` is non-null for that plan (it is `null` for
      both paid plans — any "max N/day" text is stale)

Monthly and yearly are **separate Creem products**. Editing one does not touch
the other; they have drifted apart before, promising different allowances for
the same plan depending on billing interval.

### 3. Check the yearly savings claims

Yearly descriptions state a saving. It must equal `yearlySavingsUsd(plan)`:

```
monthlyPriceUsd × 12 − yearlyPriceUsd
```

At current prices: **$78** for Pro, **$198** for Workshop. The site computes
this figure itself, so a hardcoded number in Creem's description goes stale the
moment either price moves.

### 4. Check the product name and description

The name and description are customer-facing at the moment of payment — the
last thing read before entering card details.

- [ ] Name is the customer-facing product name, never an env var name or
      internal key (`CREEM_PROFESSIONAL_REPORT` shipped as a product *name*
      once — verify this)
- [ ] Description has no duplicated clauses (copy-paste artifacts have
      shipped here before)
- [ ] Description avoids hardcoded promotional framing such as
      "introductory price". Creem renders the price itself, and prose like
      that becomes a false promise the moment the promotion ends. The site
      already handles the struck-through reference price and the
      `INTRODUCTORY PRICE` badge.

### 5. Verify against live checkout — do not trust the dashboard form

The dashboard can show a saved value that the checkout page does not use.
Verify what a **customer actually sees**.

From the browser console on `https://dtcdecoder.com/pricing`:

```js
await fetch('/api/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ plan: 'pro', interval: 'yearly', email: 'you@example.com' })
}).then(r => r.json())
```

Open the returned `checkoutUrl` and read the rendered name, price, billing
period, and description. Repeat for all four plan/interval combinations.

This creates a real Creem **checkout session**, which is safe: no charge is
made and nothing is submitted. Do **not** complete payment. Sessions expire on
their own; no cleanup needed.

The one-time report route (`/api/checkout/single-report`) requires an
authenticated session and returns `401` when signed out. To verify it while
signed out, open the product's payment page directly:

```
https://creem.io/payment/<product_id>
```

A `401 "Sign in to buy a professional report."` is the **healthy** response
when signed out — it proves the config guard passed. A
`503 "One-time checkout is temporarily unavailable"` means the env var is
missing or misnamed (step 7).

### 6. Confirm the site and Creem agree

Load `https://dtcdecoder.com/pricing`, toggle **Monthly** and **Yearly**, and
confirm each card's price and bullets match the corresponding checkout page.

### 7. If you added or renamed an env var

- [ ] Name matches `src/lib/env.ts` character for character, including the
      `_PRODUCT_ID` suffix
- [ ] Added to the **Production** scope in Vercel — and **Preview** too, or
      preview deployments will report the feature unavailable
- [ ] **Redeployed.** Env var changes do not apply to an existing deployment.
      Redeploy the current build rather than deploying whatever is checked out
      locally:

```bash
npx vercel redeploy <current-production-url> --target production
```

- [ ] Deleted the superseded variable so it cannot mislead later

Product IDs are **not secrets** — they appear in public checkout URLs. API
keys and webhook secrets are. Never paste those into a doc, commit, or log.

### 8. Record it

Note the date, what changed, and who verified it in the changelog below.

## Post-change smoke test

- [ ] All four subscription checkouts open with the correct name, price, and
      billing period
- [ ] One-time report checkout returns `401` when signed out (not `503`)
- [ ] Pricing page monthly and yearly views both match Creem
- [ ] Yearly savings figures equal `monthlyPriceUsd × 12 − yearlyPriceUsd`
- [ ] No description mentions a daily cap
- [ ] No product name contains an env var name or internal key

## Known gaps

- **Nothing automated enforces any of this.** A test asserting Creem's live
  config against `pricing.ts` would need a Creem API key in CI; the repo has no
  Actions secrets configured today, and the Playwright workflow fails on every
  branch for that reason. Until that is fixed, this checklist is the only gate.
- **Existing subscribers are unaffected by a Creem price change.** They stay on
  the amount they signed up at. Repricing is not retroactive, so a mismatch can
  persist in real revenue long after both sides look correct.
- **Add-on packs are not yet covered** — no real products exist for them.

## Changelog

| Date | Change | Verified by |
|---|---|---|
| 2026-07-31 | Reconciled all five products after prices drifted (site $39/$390/$99/$990 vs Creem $19/$198/$49/$558). Corrected allowances to 20/75, removed stale daily caps, fixed yearly savings to $78/$198, renamed the one-time product from `CREEM_PROFESSIONAL_REPORT` and gave it a real description. Verified every product via live checkout session. | Owner + Claude |
