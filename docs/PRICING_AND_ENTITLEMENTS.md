# Pricing & Entitlements

Canonical source of truth: **`src/lib/pricing.ts`** (`AI_DIAGNOSTIC_ENTITLEMENTS`, `PAID_PLANS`). Every consumer — pricing UI, account page, both AI features' server-side gates, tests — reads this one registry. No duplicate copies exist.

## Plans

Internal/database plan keys stay `free` / `pro` / `workshop` (the existing Postgres enum `subscription_plan` and live Creem product mapping) rather than the spec's suggested `pro_technician`/`workshop` keys — changing the enum would require remapping real Creem product IDs and risks existing-subscriber breakage for no functional benefit. The customer-facing label is already "Pro Technician" / "Workshop" everywhere (`PAID_PLANS[plan].label`), which is the only place the naming actually matters.

| | Free | Pro Technician | Workshop |
|---|---|---|---|
| Price | $0 | $19/mo · $198/yr | $49/mo · $558/yr |
| Basic DTC lookup | Unlimited | Unlimited | Unlimited |
| AI diagnostic previews/day | 2 | — (gets full reports instead) | — (gets full reports instead) |
| Full AI diagnostic reports/month | 0 | 30 | 120 |
| Full AI diagnostic reports/day | 0 | 5 | 15 |
| Technician seats | 1 | 1 | 3 (entitlement only — see below) |
| PDF export | No | Yes | Yes |
| Shared cases | No | No | 3 (entitlement only — see below) |
| Priority support | No | No | No (not actually provided) |

Yearly price = monthly × 12 − $30 flat discount (`YEARLY_FLAT_DISCOUNT_USD`), for both paid plans. Pinned in `test/pricing.test.ts`.

## Basic lookup vs. AI diagnostic analysis

Two distinct product actions, gated completely differently:

- **Basic DTC lookup** (`/dtc`, `/dtc/[code]`) — a deterministic database read (`getGenericDtcCode`). No auth check, no plan check, no AI call, ever. Confirmed by inspection: the page only optionally records search history for a signed-in user; an anonymous visitor gets the exact same DTC content.
- **AI diagnostic analysis** — personalized reasoning from vehicle/scan/symptom data, spanning both the "DTC Assistant" chat feature and "Scan Report Analysis." This is what consumes the allowances in the table above, via one shared ledger (see `docs/AI_USAGE_LIMITS.md`).

## Workshop seats/shared cases — entitlement modeled, not yet functional

This repo has no multi-user/team/org concept anywhere (every table is scoped to a single owning `user_id`). `technicianSeatLimit: 3` and `sharedCases` are stored as real entitlement fields so pricing can honestly advertise "up to 3 technician accounts" as a near-term roadmap commitment, but **no invite flow, shared login, or shared case visibility is built in this pass**. If a Workshop customer asks to add a second technician today, there is no UI or backend to do it — this needs a follow-up epic (team table, invite-by-email, RLS rewrite for shared `scan_cases`/`scan_reports` visibility) before the claim becomes literally true. Tracked as a known gap, not silently dropped.

## Consumers of the canonical registry

- `src/lib/ai-diagnostics/entitlements.ts` — shared getters (`getEntitlements`, `canAccessFullDiagnostics`, `previewDailyLimit`, `fullDailyLimit`, `fullMonthlyLimit`, `canExportPdf`, `technicianSeatLimit`, `accessLevelForPlan`).
- `src/lib/scan-diagnostics/entitlements.ts` — thin wrappers over the above, kept only so existing scan-diagnostics call sites didn't need renaming.
- `src/components/PricingPlans.tsx` — pricing page copy (static per-locale strings in `messages/en.json`/`es.json`, never raw numbers interpolated from config).
- `src/app/(app)/account/(protected)/page.tsx`, `src/app/(app)/pricing/page.tsx` — usage meters via `getAiDiagnosticUsageSummary` + `toLegacyUsageSummary`.
