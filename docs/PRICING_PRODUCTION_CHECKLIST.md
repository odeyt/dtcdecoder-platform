# Pricing/Entitlement Production Checklist

Do not promote to production until every item below is checked. This mirrors the deployment-safety sequence already used for the Diagnostic Safety v2 rollout (`docs/PRODUCTION_VERIFICATION.md`) — nothing here skips a step that worked before.

> This checklist was written for the original entitlement-overhaul rollout
> (migration `0016`) and its numbers below are from that point in time —
> treat them as historical, not current. Migrations `0016` and `0022`
> (`basic_search_usage`) have since been applied to the shared Preview/
> Production Supabase project; `0023` (`ai_diagnostic_runs` cost-ledger
> columns) and `0024` (`report_addon_balances`) have not. The pricing/AI-
> cost-control overhaul as a whole (`docs/PRICING_AND_AI_COST_AUDIT.md`)
> has not been pushed or deployed. Before that eventually happens, this
> checklist's steps should be re-run against the CURRENT numbers in
> `docs/PRICING_AND_ENTITLEMENTS.md`, and a similar pass is still needed
> for migrations 0023/0024 specifically before they're applied.

## Before opening a PR / merge

- [ ] `npx tsc --noEmit` — clean
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — all tests pass (178 at the time of writing, up from 165 pre-existing)
- [ ] `npm run build` — succeeds
- [ ] `git diff --stat` reviewed — confirm no `.env*`, no build artifacts, no unrelated files staged
- [ ] Manual secret scan of every new file (none introduced — this pass adds no new third-party credentials)
- [ ] Migration `0016_ai_diagnostic_entitlements.sql` read through — confirmed additive-only (two new tables, two new functions, RLS policies; no `ALTER`/`DROP` on any existing table)

## Migration application (one-at-a-time, same process as `0012`–`0015`)

- [ ] Present migration `0016` SQL + verification queries for explicit confirmation before running
- [ ] Apply to the shared Preview/Production Supabase project
- [ ] Verify: `ai_diagnostic_usage` and `ai_diagnostic_runs` tables exist with the expected columns/constraints
- [ ] Verify: `record_ai_diagnostic_usage` and `get_ai_diagnostic_usage_summary` functions exist and are callable
- [ ] Verify: RLS is enabled on both new tables with owner-read-only policies, matching the `scan_usage` precedent

## Preview deployment

- [ ] Push branch, confirm Vercel Preview build succeeds
- [ ] Pricing page displays the new copy (30/120 report allowances, no raw token numbers, "Up to 3 technician accounts" for Workshop)
- [ ] Yearly-savings math renders correctly ($16.50/mo and $46.50/mo effective, "Save $30" badge) — pinned by `test/pricing.test.ts`, but re-verify visually
- [ ] Anonymous visitor can look up a DTC code with no sign-in wall
- [ ] Free-tier signed-in user: send 2 chat questions successfully, confirm the 3rd is blocked with the free-tier-limit message and no AI call is made (check server logs — no Anthropic API call logged for the 3rd attempt)
- [ ] Free-tier signed-in user: run a scan-report analysis, confirm the report view shows the preview layout (top-2 causes/tests, locked-sections panel, no full ranked-cause detail) — inspect the Network tab response body directly to confirm `rankedCauses`/`recommendedTests`/`confidenceLevel` are genuinely absent from the JSON, not just hidden by CSS
- [ ] Pro/Workshop test account (if available) sees the full, unredacted report and chat response
- [ ] Mobile viewport: pricing cards and locked-result cards don't overflow horizontally
- [ ] `docs/PAYMENT_PLAN_MAPPING.md` confirmed still accurate (Creem checkout remains blocked on missing product IDs — this is expected, not a regression)

## Production

- [ ] Explicit authorization obtained before merging to `main` / promoting
- [ ] Post-deploy smoke test: pricing page loads, `/dtc/[code]` loads for an anonymous visitor, signed-in account page shows a real (non-placeholder) usage number
- [ ] Confirm no existing paid subscriber's access changed unexpectedly (there are none currently, per `docs/PAYMENT_PLAN_MAPPING.md` — checkout has never been completable in this environment, so this is a formality, not a real risk this time)

## Rollback readiness

- [ ] `docs/PRICING_ROLLBACK_PLAN.md` reviewed and understood before deploying — know the revert command and that no DB rollback is required for a code-only revert
