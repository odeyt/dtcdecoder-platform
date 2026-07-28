# Phase 2.3 Step 3 — Environment Variable Separation (Audit, Not Yet Resolved)

## Required environment-variable names (values never recorded here)

| Concern | Variable name(s) |
|---|---|
| Supabase URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Supabase anonymous key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase service-role key | `SUPABASE_SERVICE_ROLE_KEY` |
| Provider API key | `ANTHROPIC_API_KEY` |
| Creem configuration | `CREEM_API_BASE_URL`, `CREEM_API_KEY`, `CREEM_WEBHOOK_SECRET`, `CREEM_SUCCESS_URL`, `CREEM_*_PRODUCT_ID` (pro/workshop/addon variants) |
| Site URL | `NEXT_PUBLIC_SITE_URL` |
| Authentication redirect URL | derived from `NEXT_PUBLIC_SITE_URL` (Supabase Auth redirect config in the Supabase dashboard, not a separate env var in this codebase) |
| Rollout tier | `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` |
| Internal tester allowlist | `DIAGNOSTIC_ENGINE_ALLOWED_EMAILS` |
| Diagnostic budget values | `DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH` |

## Finding: Preview and Production currently share the same Supabase project

Checked via `vercel env ls` (Vercel project `redlined1-s-projects/dtcdecoder`) and confirmed by
pulling both environments' variables to a scratchpad location outside the repo, hashing
`SUPABASE_SERVICE_ROLE_KEY` from each (never printing the raw value), comparing, then deleting the
temp files immediately:

- `SUPABASE_SERVICE_ROLE_KEY` is registered as a single Vercel entry scoped to **"Preview,
  Production"** together (not two separate per-environment values the way
  `NEXT_PUBLIC_SUPABASE_URL` is). The SHA-256 hash of the Preview-pulled value and the
  Production-pulled value are **identical** — this is the same live database credential in both
  environments.
- `ANTHROPIC_API_KEY` is configured for **Production only**. Preview and Development have no
  provider key at all.
- No `DIAGNOSTIC_ENGINE_*` variable exists in Vercel for any environment yet (Production included)
  — the engine is fully off everywhere by default, which is safe, but nothing is staged for
  internal testing either.

## Why this blocks Steps 4 onward

The Phase 2.3 spec is explicit: *"The staging deployment must not use production Supabase
credentials"* and *"Do not continue if the database cannot be positively identified as staging."*
Right now, any Vercel Preview deployment of this branch — including one created simply by opening
a pull request — would connect to the **exact same Supabase project as production**. Applying
migrations `0030`–`0035`, running real RLS security tests, or exercising a real provider-backed
diagnostic turn from a Preview URL right now would all operate against production data. That is
not staging isolation; it is production with a different URL.

**Nothing in Steps 4–13 has been attempted.** No migration has been run anywhere. This is a
positive-identification failure caught before any database action, per the spec's own instruction.

## What is needed to unblock

One of:

1. **A new, separate Supabase project dedicated to staging**, created via the Supabase dashboard
   (I have no Supabase CLI or Management API credential available in this environment to create
   one myself). Once created, its URL / anon key / service-role key need to be added as
   **Preview-only** Vercel environment variables — distinct rows from the existing
   Production-scoped ones, never overwriting them — so Preview deployments stop pointing at
   production.
2. **An existing separate staging Supabase project** I'm not currently aware of, if one already
   exists outside what's visible via `vercel env ls`.

Either way, a provider API key usable from Preview also needs to be decided: a dedicated
lower-budget Anthropic key, or the existing production key reused under the Phase 2.2 budget
guardrails (global/internal daily caps) with the explicit understanding that it is the same
billing account. This is a decision only the account owner can make, not something to assume.

No further staging steps proceed until this is resolved.
