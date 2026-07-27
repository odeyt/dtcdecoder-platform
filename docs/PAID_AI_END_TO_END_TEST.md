# Paid AI Diagnosis — Authenticated End-to-End Test

Status as of this writing: **NOT RUN.** No entitled, signed-in paid test account has
been used to exercise this flow against production. Everything below has been verified
by code inspection, `npx tsc --noEmit`, `npm run lint`, and `npx vitest run` (all
passing) — not by a live authenticated request. Do not claim the paid AI path is
verified end-to-end until someone runs this procedure and updates the result section
at the bottom with actual output.

This is a **documented manual verification procedure**, not a public bypass. There is
no unauthenticated or free-tier way to reach the provider call — every step below still
goes through the real sign-in, entitlement, and quota checks described in
[`FREE_PREVIEW_SECURITY.md`](FREE_PREVIEW_SECURITY.md) and
[`AI_USAGE_LIMITS.md`](AI_USAGE_LIMITS.md). Anyone running this test is simply a real
Pro/Workshop customer, verified by hand.

## What this tests

The "Run Full AI Diagnosis" entry point (search results → `/diagnostics/quick` →
`POST /api/scan-diagnostics/cases/quick`) end to end:

1. Sign-in and entitlement enforcement (401 unauthenticated, 403 Free).
2. Quota reservation before the AI call, commit after success
   (`ai_diagnostic_usage` — see [`AI_USAGE_LIMITS.md`](AI_USAGE_LIMITS.md)).
3. The real Anthropic call (`AnthropicDiagnosticProvider`, unchanged from the
   file-upload flow — see [`SCAN_REPORT_ANALYSIS.md`](SCAN_REPORT_ANALYSIS.md)).
4. Cost/observability logging (`ai_diagnostic_runs` — see
   [`PRICING_AND_AI_COST_AUDIT.md`](PRICING_AND_AI_COST_AUDIT.md)).
5. Report-language translation for a non-English request
   (`src/lib/scan-diagnostics/report-localization.ts` — see
   [`DYNAMIC_REPORT_TRANSLATION.md`](DYNAMIC_REPORT_TRANSLATION.md)).
6. Refund of the quota reservation if the provider call fails.

## Test-account requirements

- A real Supabase auth user, signed in via magic link (no password flow exists —
  see `CLAUDE.md`).
- That user's `getEffectivePlan()` must resolve to `pro` or `workshop` — either a real
  Creem subscription in `subscribed`/`trialing` status, or (for a staging-only test
  account with no real payment) a manually-set row in whatever table
  `getEffectivePlan` reads (`src/lib/subscriptions.ts`) — check that file for the exact
  column before editing any row directly, and never do this against a real customer's
  account.
- The test account must have at least 1 remaining full-report allowance today and this
  month (`fullDailyLimit`/`fullMonthlyLimit` in `src/lib/pricing.ts`
  `AI_DIAGNOSTIC_ENTITLEMENTS`) — check current usage first with:
  ```sql
  select * from get_ai_diagnostic_usage_summary('<user-id>');
  ```
- `ANTHROPIC_API_KEY` configured in the environment being tested (already confirmed in
  production as of this task).

## Controlled test case

| Field | Value |
|---|---|
| DTC code | `P0420` |
| Vehicle | 2018 Toyota Camry |
| Engine | 2.5L |
| Symptoms | "Check engine light and poor fuel economy" |
| Report language | English first, then one non-English locale (e.g. `es`) |

## Procedure

### Part 1 — English report

1. Sign in as the test account.
2. Go to `/dtc?q=P0420` (or directly to `/dtc/p0420` if that code is published) and
   click **Run Full AI Diagnosis** — or navigate directly to
   `/diagnostics/quick?code=P0420&make=Toyota&model=Camry&modelYear=2018&engine=2.5L`.
3. Confirm the form is prefilled (DTC code, year/make/model/engine) and not blocked by
   a sign-in or upgrade prompt (if either appears, the account isn't correctly
   entitled — fix the account, not the code).
4. Enter symptoms: `Check engine light and poor fuel economy`. Leave report language at
   the default (English).
5. Submit. Expect a `201` from `POST /api/scan-diagnostics/cases/quick` with body shape:
   ```json
   {
     "case": { "id": "...", "status": "completed", "report_language": "en", ... },
     "report": {
       "id": "...",
       "ranked_causes": [ /* 1+ entries */ ],
       "recommended_tests": [ /* 1+ entries */ ],
       "confidence_level": "high" | "medium" | "low" | "insufficient_evidence",
       "schema_version": "2.0",
       ...
     }
   }
   ```
6. The browser redirects to `/diagnostics/<case.id>`. Confirm the page renders ranked
   causes, recommended tests, and confidence — not a locked/preview card (a locked card
   here means the plan resolved to Free; stop and fix the account).

### Part 2 — Non-English report

7. Repeat steps 2–4, this time selecting a non-English report language (e.g. Spanish)
   in the form's language dropdown before submitting.
8. On the resulting case-detail page, confirm:
   - The ranked causes / recommended tests / missing-information text reads as
     translated prose (not English), OR
   - A visible note reads "Requested in es, but the translation was unavailable —
     showing the English report below" (the documented fallback — see
     `ScanReportView.tsx`) if the translation failed/fell back.
   - Either way, DTC codes, VINs, and measurements/units embedded in that text are
     unchanged from the English version (protected-token preservation — see
     `src/lib/ai/token-preservation.ts`).

### Part 3 — Refund-on-failure (optional, requires a way to force a provider failure)

9. If a staging Anthropic key can be temporarily pointed at an invalid model id or
   revoked, repeat step 5 once with that broken configuration. Expect a `502` (see
   `ScanAnalysisFailedError` in `src/lib/scan-diagnostics/api-errors.ts`), and confirm
   the reservation from step 5 above did **not** persist for this new attempt (query
   below), i.e. this case's row was never inserted into `ai_diagnostic_usage`, or was
   inserted and then deleted by `releaseAiDiagnosticUsage`.

## Where to verify

Run these against the same environment the test was performed in.

**Quota consumed and committed** (one row per successfully completed case, keyed by
`request_id = case.id`):
```sql
select * from ai_diagnostic_usage where user_id = '<user-id>' order by created_at desc limit 5;
```

**Provider usage / cost, including the translation call** (one `standard_report` row
for the diagnosis, plus one `additional_language` row if a non-English report was
requested):
```sql
select operation_type, model_id, status, input_tokens, output_tokens,
       estimated_total_cost_micros, credits_consumed, created_at
from ai_diagnostic_runs
where user_id = '<user-id>'
order by created_at desc limit 10;
```

**Refund after failure** — after a forced failure (Part 3), the case's row should be
absent from `ai_diagnostic_usage` for that `request_id`, and a corresponding `status =
'failed'` row should exist in `ai_diagnostic_runs`.

**Localized output persisted** (cache row written after a successful translation):
```sql
select locale_code, status, resolved_locale, fallback_used, provider, model, created_at
from scan_report_localizations
where report_id = '<report-id-from-the-201-response>';
```

**Analytics funnel events** (best-effort, non-blocking — see
`src/lib/analytics/events.ts`):
```sql
select event_type, metadata, created_at from analytics_events
where user_id = '<user-id>' order by created_at desc limit 20;
```
Expect to see `ai_diagnosis_cta_clicked` (if reached via a search-result CTA click),
`ai_diagnosis_started`, and `ai_diagnosis_completed` (or `ai_diagnosis_failed` for
Part 3) in that order.

## Result

> _Not yet run. No entry to report._
