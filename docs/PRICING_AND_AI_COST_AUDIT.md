# Pricing & AI Cost Audit

**Status: audit only — nothing in this document has been implemented.** Per the task's own instructions, this is Phase 1: report current state, propose the plan, and stop for approval before touching code, migrations, or deploying anything.

## 1. Current plans (live in production today)

Source of truth: `src/lib/pricing.ts` (`AI_DIAGNOSTIC_ENTITLEMENTS`, `PAID_PLANS`).

| | Free | Pro Technician | Workshop |
|---|---|---|---|
| Price | $0 | $19/mo · $198/yr | $49/mo · $558/yr |
| Basic DTC lookup | Unlimited, unauthenticated | Unlimited | Unlimited |
| AI diagnostic previews/day | **2** (redacted, shared counter with chat) | — | — |
| Full AI diagnostic reports/month | 0 | 30 | 120 |
| Full AI diagnostic reports/day | 0 | 5 | 15 |
| Technician seats | 1 | 1 | 3 (entitlement modeled only — no invite/shared-login mechanism built) |
| PDF export | No | Yes | Yes |

This was built and deployed earlier in this same session (`docs/PRICING_AND_ENTITLEMENTS.md`, `docs/AI_USAGE_LIMITS.md`, `docs/FREE_PREVIEW_SECURITY.md`). **The current live model gives free users 2 real AI-generated (redacted) previews per day** — this is the opposite of this task's primary product decision ("Free plan must receive no runtime AI diagnostic calls"). Implementing this task fully means reversing that behavior, not extending it.

Checkout itself is not yet live: `CREEM_API_KEY`/`CREEM_WEBHOOK_SECRET`/all four product IDs were configured and verified working earlier this session, but Creem's live-payments account verification (KYC) is still pending on Creem's side (`docs/PAYMENT_PLAN_MAPPING.md`). `NEXT_PUBLIC_BILLING_ENABLED=true` is set, so the checkout UI is live, but a real charge cannot currently complete.

## 2. Existing quota implementation

- **Ledger**: `ai_diagnostic_usage` table (migration `0016`) — one row per successfully-granted generation, unique on `(user_id, request_id)`. Shared across both AI features (chat + scan-report analysis) under one counter.
- **Enforcement**: `record_ai_diagnostic_usage()` Postgres function — atomic check-and-insert with a per-user advisory lock (`pg_advisory_xact_lock`), UTC-anchored daily/monthly windows.
- **Application layer**: `src/lib/ai-diagnostics/usage.ts` — `recordAiDiagnosticUsage()` (reserve, called before the AI provider call) / `releaseAiDiagnosticUsage()` (release on failure, so a failed generation never consumes an allowance).
- **Granularity today: report-count only.** There is no per-operation credit weighting (a short chat question and a long scan-report analysis currently cost the same "1 unit"), no distinction between primary-analysis vs. safety-review vs. translation as separately billable sub-operations, and no concept of "follow-up turns" within an already-paid-for report.
- **No basic-DTC-search rate limiting exists at all.** `/dtc/[code]` and the DTC lookup search are fully unauthenticated, unrated, unlimited today — confirmed by inspection (`docs/AI_USAGE_LIMITS.md` section "What counts, what doesn't"). This task's "3/day, 10/month basic search" requirement is entirely new scope, not a tightening of an existing limit.

## 3. Current AI providers

**Anthropic Claude only** (`@anthropic-ai/sdk`, model `"claude-sonnet-5"`), confirmed repo-wide — no OpenAI, Gemini, or other provider integration exists anywhere in this codebase. Every AI call (chat, scan-report primary analysis, translation) uses the same single model; there is no model-routing layer, no cheaper-model-for-cheaper-task logic, and no local/deterministic pre-processing step for language detection or symptom normalization.

## 4. Existing token/cost logging

- `ai_diagnostic_runs` (migration `0016`) — one row per AI call attempt (success or failure): `user_id, feature, request_id, plan, provider_id, model_id, status, access_level_requested, input_tokens, output_tokens, cached_tokens, estimated_cost_usd, error_message, created_at`. Populated today only by the **chat** route; scan-diagnostics continues using its own pre-existing `scan_ai_runs` table (same shape, scan-only, predates this session's work) rather than double-logging.
- **`estimated_cost_usd` is defined but never actually computed anywhere** — always `null`/omitted at every call site. No per-model cost table, no price-per-token constants, no cost-calculation function exists yet.
- **Storage type**: `estimated_cost_usd numeric(10,6)` — a decimal column, **not** integer micro-units as this task requires. Would need a new column (or a migration converting the existing one) to switch representations.
- No reservation/refund semantics beyond the usage-slot (report-count) reserve/release already described in §2 — there is no separate *cost* reservation distinct from the *quota-slot* reservation.

## 5. Cost risks in the current implementation

- **No pre-flight cost estimation or hard ceiling.** A request is allowed to run at full effort/`max_tokens` as long as a quota slot is available — there is no check on projected token/dollar cost before calling the provider, and no mechanism to reject or downgrade an unusually large request (e.g., a very large uploaded scan-report file, or a long chat conversation).
- **No context-length bounding beyond file-size validation.** `SCAN_FILE_MAX_SIZE_BYTES` (15 MB default) and the existing `PDF_MAX_PAGES`-style parser limits bound the *input file*, but there's no cap on extracted-text tokens actually sent to the model, no prompt-caching, no case-history summarization, and no dedup of unchanged vehicle data across a multi-turn interaction.
- **No per-model routing** — every operation (safety review, translation, primary analysis) uses the same model at the same cost tier; a cheaper model is never substituted for a cheaper sub-task.
- **No admin visibility into cost at all today** — no dashboard, no per-plan cost rollup, no "highest-cost report" surfacing. The only way to see real spend is Anthropic's own billing console.
- **Free-tier previews currently DO call the AI provider** (constrained system prompt, lower `max_tokens`, but still a real Claude call) — under the current model, 2 free calls/user/day is a real, ongoing provider cost with no revenue behind it. This is the single biggest cost-risk item this task is designed to eliminate.

## 6. Recommended changes

### 6.1 Product/plan structure
Adopt the target structure specified in the task, with the pricing/quota numbers exactly as given (Free $0 with basic-search-only; Pro $39/mo·$390/yr, 20 reports/mo, 3/day; Workshop $99/mo·$990/yr, 75 reports/mo, 8/day, 3 seats; Enterprise custom/contracted). This is a **price increase** on existing Pro/Workshop numbers (Pro $19→$39, Workshop $49→$99) and a **reduction** in monthly report allowances (Pro 30→20, Workshop 120→75) relative to what's live today — flagging explicitly since there are (per `docs/PAYMENT_PLAN_MAPPING.md`) no completed real subscriptions yet (Creem verification still pending), so there is no existing paying customer who would need grandfathering. If that changes before this ships, grandfathering becomes a required step, not optional.

### 6.2 Free tier: remove AI entirely, add basic-search rate limiting
- Free stops consuming `ai_diagnostic_usage` entirely — no previews, no redacted AI calls, zero provider spend.
- Replace the free-preview UI (`LockedResultCard`/`LockedResultPanel`, currently rendered *after* a real AI response) with **static, pre-written example content** — no per-request generation, so this is just React components with fixed copy, not a data flow to design.
- New basic-search rate limit: 3/UTC-day, 10/calendar-month, enforced server-side, keyed by authenticated `user_id` or a server-issued anonymous identifier (signed, httpOnly cookie — never a client-editable value) for anonymous visitors. This is new infrastructure; nothing like it exists today.

### 6.3 Unified credit model
Introduce a `diagnostic_credits` concept as an accounting abstraction *underneath* the customer-facing "reports" language (per the spec: "customer-facing UI may continue to say 'reports'"). Concretely: `fullDiagnosticMonthlyLimit`/`fullDiagnosticDailyLimit` become credit budgets rather than raw report counts, and each operation type (primary report, extra reviewer pass, extra language, regeneration, follow-up turn) debits a configured credit amount from `src/lib/pricing.ts`'s registry. This changes the *unit* the existing `record_ai_diagnostic_usage()` RPC reserves — a schema and function change, not just an application-layer change.

### 6.4 Cost ledger, guards, and model routing
All net-new: a real per-call cost-estimation function (needs a maintained $/token table per model, since Anthropic's pricing isn't queryable at runtime), a pre-flight estimate-check-reserve-execute-record-commit/refund pipeline layered on top of (not replacing) the existing quota reserve/release flow, and a model-routing config table/module — currently moot in one sense (only one model, Claude Sonnet, is integrated anywhere), so "route to a cheaper model" requires **first deciding which additional Claude model tier(s)** to introduce for the cheap sub-tasks (e.g., Haiku for language detection/symptom normalization) before any routing logic has something to route *to*.

### 6.5 Admin profitability dashboard
Follows the existing `/admin/*` pattern exactly (`isAllowedAdminEmail()` gate in `admin/layout.tsx`, same as `admin/dtc-codes`, `admin/glossary`, etc.) — new `/admin/profitability` page reading rollups from the new cost ledger, plus a `/admin/settings`-style config page for the quotas/costs/routes currently hardcoded in `pricing.ts`.

## 7. Database changes required (not yet created — proposed only)

All additive, next migration number is **`0022`** (repo is at `0021_scan_report_localizations.sql`):

- Extend or replace `ai_diagnostic_usage`/`record_ai_diagnostic_usage()` to reserve **credits** (a decimal/numeric amount) rather than a flat integer slot per call, keyed the same way (`user_id`, `request_id`, UTC day/month windows, advisory-lock serialized).
- New `ai_diagnostic_cost_ledger` table matching the exact field list in the task (user_id, workspace_id, diagnostic_case_id, report_id, plan, provider, model, operation_type, token counts, cost fields **in integer micro-units**, currency, latency, status, reservation_id, created_at) — this supersedes/extends `ai_diagnostic_runs` rather than being fully separate, to avoid a third overlapping log table alongside `ai_diagnostic_runs`/`scan_ai_runs`.
- New `basic_search_usage` table + `record_basic_search_usage()` RPC, mirroring the existing UTC-day/month pattern.
- New `report_addon_balances` table for add-on-pack credits, tracked separately from the monthly included allowance per the spec, consumed only after the included allowance is exhausted.
- New `CREEM_PRO_ADDON_10_PRODUCT_ID` / `_25_` / `_50_` env vars once real Creem products exist for the three add-on packs (checkout for these stays disabled until configured, per the task's own instruction and this project's established pattern for the existing subscription products).
- New `plan_config` (or similar) table if quotas/costs are to be admin-editable at runtime rather than requiring a code deploy — the task's "Allow administrators to configure: Plan quotas, Daily limits..." implies moving `AI_DIAGNOSTIC_ENTITLEMENTS` from a static TS registry to a DB-backed, cached config. This is a meaningfully larger change than editing the registry file, worth confirming is actually wanted versus keeping the registry file as the source of truth and only exposing it read-only in the dashboard.

## 8. Rollout plan (proposed slicing, mirrors this session's established pattern)

Given the scope here is substantially larger than the entitlement overhaul already shipped this session (that took the full preceding conversation on its own), I'd propose implementing in the following independently-shippable slices, each verified (`tsc`/`lint`/`vitest`/`build`) and committed separately, with migrations presented one-at-a-time for confirmation before being applied to the shared Preview/Production database — same discipline as every migration so far:

1. Canonical registry update (`pricing.ts` → new plan numbers, credit weights, cost-guard constants) + basic-search rate-limit migration/enforcement + remove free-tier AI calls entirely (replace with static locked examples).
2. Cost ledger migration + cost-estimation function + pre-flight guard pipeline (reserve→execute→commit/refund), wired into the existing chat + scan-report call sites.
3. Model-routing config + (if approved) introduction of a second, cheaper Claude model tier for sub-tasks.
4. Add-on packs (schema + entitlement wiring; checkout stays disabled pending real Creem product IDs, per instruction).
5. Admin profitability dashboard + admin-editable config (scope of "editable" to be confirmed per §7's last bullet).
6. Pricing page copy + launch-pricing display logic.
7. Required tests (the task's own 18-item list) + documentation.

## 9. Open questions before implementation starts

1. **Confirmed no grandfathering needed** (no completed real subscriptions exist yet) — correct?
2. Is moving the entitlement registry from a static TS file to an admin-editable DB table actually wanted (§7 last bullet), or should admin "configuration" just mean read-only visibility into the current file-based values for this first pass?
3. For model routing to mean anything beyond "config that does nothing," which second (cheaper) Claude model tier should be introduced — Haiku 4.5 is the obvious candidate given it's already listed as available in this environment.
4. Launch/introductory pricing — should this reuse the existing Creem product IDs (still under KYC review) with a display-only "was $X, now $Y" treatment, or does it require *new* Creem products at the discounted price? The task says "without changing the canonical list price," which suggests display-only, but Creem checkout ultimately charges whatever the linked product's real price is — worth confirming before building the display logic around a price it can't actually charge.

No files, migrations, or deployments have been touched. Awaiting direction on the above before starting Slice 1.

---

## Addendum: mid-Slice-1 file-collision incident

While implementing Slice 1, a second, concurrently-running Claude Code session in this same working directory committed a snapshot (`8adb099`) that accidentally bundled in this file plus the in-progress `pricing.ts`/`PricingPlans.tsx`/`messages/*.json` edits, then (correctly) reverted just those files in a follow-up commit (`e67e4aa`) once the collision was noticed, restoring a clean baseline. The user paused/terminated the other session and this work was reapplied from scratch on top of the clean baseline. No data was permanently lost, but this is the reason Slice 1's commit history looks like a redo rather than a single linear pass.

## Addendum: implementation status (Slices 1–7 complete)

Every slice in §8's rollout plan has been implemented, tested, and committed locally. §9's open questions were resolved along the way rather than staying open:

1. **No grandfathering** — confirmed; no real subscriptions existed when this work started.
2. **Admin config editability** — resolved as read-only for this pass, by explicit user direction. `/admin/profitability` displays current `pricing.ts`/`model-routing.ts` values; changing one still requires a code edit and redeploy. No `plan_config`-style DB table was built.
3. **Model routing tier** — Claude Haiku 4.5 introduced as the economical tier (`src/lib/ai-diagnostics/model-routing.ts`). Chat translation routes to it; main generation (chat + scan) stays on Sonnet 5.
4. **Launch pricing mechanics** — resolved as display-only, gated behind `LAUNCH_PRICING_ACTIVE` (still `false`). An explicit operational note in `src/lib/pricing.ts` documents that the linked Creem product's real price must be updated before the flag is ever flipped, since this app never sends a per-checkout price override.

What shipped, by slice:

- **Slice 1**: canonical registry rewrite (new prices/quotas — Pro $39/mo·390/yr·20mo·3day, Workshop $99/mo·990/yr·75mo·8day), basic-search rate limiting (migration `0022`, applied to production), free-tier AI generation removed entirely (no code path can reach an AI provider on Free).
- **Slice 2**: AI cost ledger (migration `0023`, extends `ai_diagnostic_runs` — not applied), `src/lib/ai-diagnostics/cost.ts` (estimate/actual cost computation, hard-ceiling guard), wired into both AI features' pre-flight and post-generation paths.
- **Slice 3**: model routing (`model-routing.ts`), Haiku 4.5 introduced, chat translation routed to it, cost-ledger rows now record the routed model per operation.
- **Slice 4**: add-on report packs (migration `0024` — not applied; schema + `record_ai_diagnostic_usage()` extension + checkout route + webhook branch), inert until real Creem product IDs exist.
- **Slice 5**: read-only admin profitability dashboard (`/admin/profitability`), no new migration.
- **Slice 6**: launch-pricing display logic (inert, flag off) and add-on-pack UI (account page + pricing bullets), also inert pending Slice 4's product IDs.
- **Slice 7**: the mega-prompt's 18-item required-test list, all proven (`test/required-proofs.test.ts` plus references to where each item was already covered), and this documentation pass.

Migrations `0016` and `0022` are applied to the shared Preview/Production Supabase project. Migrations `0023` and `0024` are written, reviewed, and committed but **not applied**. No code from Slices 2–7 has been pushed or deployed as of this addendum — see the final delivery report (chat transcript) for the exact commit hashes and push status at time of writing. **Margins shown anywhere (the admin dashboard, this doc) remain unverified operational estimates** — there is still no real production usage data, per this task's own standing instruction.
