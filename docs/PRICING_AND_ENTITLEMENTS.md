# Pricing & Entitlements

Canonical source of truth: **`src/lib/pricing.ts`** (`AI_DIAGNOSTIC_ENTITLEMENTS`, `PAID_PLANS`, `BASIC_SEARCH_LIMITS`, `ADD_ON_PACKS`). Every consumer — pricing UI, account page, both AI features' server-side gates, the admin profitability dashboard, tests — reads this one registry. No duplicate copies exist.

> Updated for the pricing/AI-cost-control overhaul (see `docs/PRICING_AND_AI_COST_AUDIT.md`). This doc previously described an earlier entitlement model ($19/$49 pricing, 2 free previews/day) that no longer exists in the code — if you find a copy of this file elsewhere with those numbers, it's stale.

## Plans

Internal/database plan keys stay `free` / `pro` / `workshop` (the existing Postgres enum `subscription_plan` and live Creem product mapping) rather than the spec's suggested `pro_technician`/`workshop` keys — changing the enum would require remapping real Creem product IDs and risks existing-subscriber breakage for no functional benefit. The customer-facing label is already "Pro Technician" / "Workshop" everywhere (`PAID_PLANS[plan].label`), which is the only place the naming actually matters.

| | Free | Pro Technician | Workshop |
|---|---|---|---|
| Price | $0 | $39/mo · $390/yr | $99/mo · $990/yr |
| Basic DTC lookup (public pages) | Unlimited | Unlimited | Unlimited |
| Interactive basic search | 3/UTC-day, 10/calendar-month | Unlimited | Unlimited |
| AI diagnostic reports | **None — no runtime AI provider calls at all** | 20/month, 3/day | 75/month, 8/day |
| Add-on report packs | Not applicable | Available (10/$15, 25/$30, 50/$55) | Available |
| Technician seats | 1 | 1 | 3 (entitlement only — see below) |
| PDF export | No | Yes | Yes |
| Shared cases | No | No | 3 (entitlement only — see below) |
| Priority support | No | No | No (not actually provided) |

Yearly price is stored explicitly per plan (`PAID_PLANS[plan].yearlyPriceUsd`), not derived from a shared flat discount — Pro saves $78/yr, Workshop saves $198/yr. Pinned in `test/pricing.test.ts`.

Optional launch/introductory pricing (`LAUNCH_PRICING`, gated by `LAUNCH_PRICING_ACTIVE`) is display-only and currently off — see the operational note on `LAUNCH_PRICING_ACTIVE` in `src/lib/pricing.ts` before ever turning it on (the linked Creem product's real price must be updated first, or checkout would charge more than the page advertises).

## Free tier: no AI, ever

Free's `aiDiagnosticPreviewDailyLimit` is `0` — the shared usage RPC (`record_ai_diagnostic_usage`, migration `0016`) rejects every Free-plan request before any AI provider is called, for both the chat and scan-report features. There is no "preview" generation mode left in the code (`buildChatPreviewSystemPromptAddendum`/`CHAT_PREVIEW_MAX_TOKENS` were removed). Free-tier UI shows static, pre-written locked examples instead — see `docs/FREE_PREVIEW_SECURITY.md`.

Free's only server-side-metered feature is interactive basic search (`basic_search_usage`, migration `0022`) — 3/UTC-day, 10/calendar-month, tracked by real `user_id` (signed in) or a server-issued anonymous cookie (signed out). Static `/dtc/[code]` page views and failed/empty searches never consume this allowance.

## Basic lookup vs. basic search vs. AI diagnostic analysis

Three distinct product actions, gated completely differently:

- **Static basic DTC lookup** (`/dtc/[code]`) — a deterministic database read (`getGenericDtcCode`/`getMakeDtcCode`). No auth check, no plan check, no AI call, no rate limit, ever.
- **Interactive basic search** (`/dtc?q=...`, `searchDtcCodes`) — also deterministic/no AI, but rate-limited for Free per the table above.
- **AI diagnostic analysis** — personalized reasoning from vehicle/scan/symptom data, spanning both the "DTC Assistant" chat feature and "Scan Report Analysis." This is what consumes the report allowances above, via one shared ledger (see `docs/AI_USAGE_LIMITS.md`) plus the AI cost ledger (`ai_diagnostic_runs`, migration `0023`) and add-on-pack balances (`report_addon_balances`, migration `0024`).

## Workshop seats/shared cases — entitlement modeled, not yet functional

This repo has no multi-user/team/org concept anywhere (every table is scoped to a single owning `user_id`). `technicianSeatLimit: 3` and `sharedCases` are stored as real entitlement fields so pricing can honestly advertise "up to 3 technician accounts" as a near-term roadmap commitment, but **no invite flow, shared login, or shared case visibility is built in this pass**. If a Workshop customer asks to add a second technician today, there is no UI or backend to do it — this needs a follow-up epic (team table, invite-by-email, RLS rewrite for shared `scan_cases`/`scan_reports` visibility) before the claim becomes literally true. Tracked as a known gap, not silently dropped.

## Add-on report packs — backend built, checkout inert

`report_addon_balances` (migration `0024`) tracks purchased/remaining credits per user; `record_ai_diagnostic_usage` automatically covers a request from an add-on credit when the plan's **monthly** allowance is exhausted (the **daily** cap stays a hard ceiling regardless — add-ons are "beyond your included monthly allowance," not a bypass of the daily cost-safety limit). Credits never expire and are consumed oldest-purchase-first.

Checkout (`/api/checkout/addon`) and the account-page UI are fully wired but return "not available yet" for every pack — no real `CREEM_ADDON_10/25/50_PRODUCT_ID` env vars exist in any environment. Nothing here is reachable by a real customer until those are configured.

## Consumers of the canonical registry

- `src/lib/ai-diagnostics/entitlements.ts` — shared getters (`getEntitlements`, `canAccessFullDiagnostics`, `previewDailyLimit`, `fullDailyLimit`, `fullMonthlyLimit`, `canExportPdf`, `technicianSeatLimit`, `accessLevelForPlan`).
- `src/lib/scan-diagnostics/entitlements.ts` — thin wrappers over the above, kept only so existing scan-diagnostics call sites didn't need renaming.
- `src/lib/basic-search/usage.ts` — the interactive-search rate limiter, reading `BASIC_SEARCH_LIMITS`.
- `src/lib/ai-diagnostics/addon-balances.ts` — add-on pack grant/balance reads.
- `src/lib/ai-diagnostics/cost.ts` / `src/lib/ai-diagnostics/model-routing.ts` — cost estimation and model routing, reading `COST_GUARDS`/`DIAGNOSTIC_CREDIT_WEIGHTS`.
- `src/components/PricingPlans.tsx` — pricing page copy (static per-locale strings in `messages/*.json`, never raw numbers interpolated from config).
- `src/app/(app)/account/(protected)/page.tsx`, `src/app/(app)/pricing/page.tsx` — usage meters via `getAiDiagnosticUsageSummary` + `toLegacyUsageSummary`, plus the add-on balance section.
- `src/app/(app)/admin/profitability/page.tsx` — read-only rollups and config visibility (`src/lib/admin-profitability.ts`).
