# AI Usage Limits — Enforcement Design

## One shared ledger across both AI features

`ai_diagnostic_usage` (migration `0016_ai_diagnostic_entitlements.sql`) is the single enforcement source for both the "DTC Assistant" chat feature and "Scan Report Analysis" — one row per successfully-granted generation, unique on `(user_id, request_id)`. A free-tier chat question and a free-tier scan-report upload draw from the **same** 2-per-day preview counter; a Pro user's chat questions and scan analyses draw from the same 30/month + 5/day full-report counter. This replaces two previously-separate, previously-incompatible systems:

| Old | Feature | Granularity | Superseded by |
|---|---|---|---|
| `ai_usage` / `increment_ai_usage` / `get_monthly_ai_tokens` / `increment_ai_tokens` (`0003`/`0004`) | Chat only | Free: 5 queries/day. Paid: raw token budget (500k/2M per month) | `ai_diagnostic_usage` |
| `scan_usage` / `consume_scan_usage_slot` / `get_monthly_scan_usage` (`0013`) | Scan reports only | Free: 2/month. Paid: 25 or 100/month, no daily cap | `ai_diagnostic_usage` |

The old tables/functions are **left in place, untouched, just unused** — additive-only, no destructive SQL. See `docs/PRICING_ROLLBACK_PLAN.md`.

## Reserve-then-release, not check-then-forget

`recordAiDiagnosticUsage()` (`src/lib/ai-diagnostics/usage.ts`) is called **before** the AI provider call, atomically checking the relevant daily/monthly limit and inserting the ledger row in one RPC (`record_ai_diagnostic_usage`) — this is the reservation. If the AI call then fails, `releaseAiDiagnosticUsage()` deletes that row, freeing the slot immediately. A retry with the same `requestId`:

- After a **release** (failed attempt): re-enters as a fresh reservation, checked against the current limit like any first attempt.
- After a **success**: the row still exists → the RPC returns `'already_recorded'` and no second charge occurs.

This fixes a real bug in both predecessor systems: `increment_ai_usage` incremented before the Claude call ran at all (a failed chat request still cost the user a query), and `consume_scan_usage_slot` reserved before the AI call and never released on failure (a failed analysis still burned a monthly slot, just wasn't double-charged on retry). The new design satisfies **both** "failed requests don't consume usage" and "retries aren't double-charged" simultaneously.

## Atomicity under concurrency

`record_ai_diagnostic_usage` takes `pg_advisory_xact_lock(hashtext(p_user_id::text))` before its count-check-insert sequence, serializing concurrent calls for the same user within the transaction — two simultaneous requests can't both read "1 used, limit 2" and both proceed. `test/ai-diagnostics-usage.test.ts` includes a `Promise.all`-based sanity check that a burst of 10 concurrent free-tier requests never grants more than 2 slots.

## UTC day/month boundaries

Both the daily and monthly windows are computed via `(created_at at time zone 'utc')::date` / `date_trunc('month', now() at time zone 'utc')` in the RPC — an explicit, server-timezone-independent boundary, not `current_date` (which depends on the Postgres session's configured timezone).

## What counts, what doesn't

Only a **successful** generation increments the ledger. Never counted: validation failures, unsupported file uploads, provider errors/timeouts, requests rejected before the AI call (e.g. already over the limit), or a duplicate retry of the same `requestId`. Basic DTC lookups never touch this ledger at all — confirmed by inspection of `/dtc/[code]/page.tsx`, which calls only `getGenericDtcCode()` (a deterministic DB read) and optionally `recordSearchHistory` (unrelated, best-effort).

## Cost/observability logging

`ai_diagnostic_runs` logs every AI provider attempt (success or failure) with tokens/provider/model/cost for internal monitoring — **never read by any enforcement path, never exposed to a customer.** Populated by the chat route (`recordAiDiagnosticRun`, both success and failure paths). The scan-diagnostics feature already had an equivalent per-attempt log (`scan_ai_runs`, predating this work) and continues to use it rather than writing to both tables redundantly.

## Per-request cost tracked

`input_tokens`, `output_tokens`, `cached_tokens` (nullable, not populated by every provider), `estimated_cost_usd` (nullable, not currently computed — no per-model cost table exists yet), `provider_id`, `model_id`, `plan`, `status`, `request_id`, `user_id`, `created_at`. No separate "workspace_id" concept exists in this single-user-only app; `user_id` is the unit of accounting.
