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

## Correction (Phase 2, direct-production session) — the hash-match claim below was wrong

**The original version of this section claimed a confirmed SHA-256 hash match between the
Preview- and Production-pulled `SUPABASE_SERVICE_ROLE_KEY` values. That claim was incorrect and is
retracted.** Re-investigation found that `vercel env pull` returns an **empty string** for every
project-defined environment variable in this Vercel project (Supabase keys, Anthropic key,
`ADMIN_ALLOWED_EMAILS`, Creem vars — all of them, across Production, Preview, and Development
alike; only Vercel's own system-injected variables like `VERCEL_OIDC_TOKEN` come through non-empty).
The original "identical hash" was two empty strings hashing the same way — a false positive, not a
real credential comparison. Root cause is most likely that these variables are marked **Sensitive**
in the Vercel dashboard (a real Vercel feature: sensitive variables are write-only and can never be
read back via CLI/API/dashboard after creation, only injected into the running app), or a
permission restriction on the CLI-authenticated account — either way, **I have no way to read any
actual Vercel environment variable value from this environment**, in any scope.

This also means the earlier "`.env.local` is a DIFFERENT Supabase project than Production" finding
from the same investigation is equally unfounded (same empty-string comparison artifact) and is
also retracted. **I do not currently know whether `.env.local`'s Supabase project
(`sysbwmiguyxwzufwxwpq`) matches Vercel Production's real configured project or not.**

## What is still reliable

`vercel env ls` lists variable *names* and which environment(s) they're scoped to — that is
metadata, not a decrypted value, and did not depend on the broken value-pull. From that listing
only:

- `SUPABASE_SERVICE_ROLE_KEY` appears as a **single entry** scoped to "Preview, Production"
  together, whereas `NEXT_PUBLIC_SUPABASE_URL` appears as **three separate entries**, one each for
  Development/Preview/Production. In Vercel's UI, a variable gets separate per-environment rows
  only when different values were entered per environment; a single combined row is how Vercel
  represents one value reused across the listed environments. This is a real, structural signal
  (not a value read) that Preview and Production were configured with the *same* service-role
  credential — but it is suggestive, not cryptographically confirmed, since the actual value cannot
  be read to verify.
- `ANTHROPIC_API_KEY` is listed for **Production only** — no entry exists for Preview or
  Development.
- No `DIAGNOSTIC_ENGINE_*` variable exists in Vercel for any environment yet.

## Consequence for identifying "the real production Supabase project"

I cannot positively identify, from this environment, which Supabase project Vercel Production
actually uses at runtime. `.env.local` points to `sysbwmiguyxwzufwxwpq`, and it may or may not be
the same project Vercel Production is configured with — I have no reliable way to check. This
directly blocks the "Confirm production Supabase project identity matches the known DTC Decoder
production project" requirement of any production release step. See the follow-up production-phase
preflight doc for how this was resolved.

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
