# Phase 2 — Production Environment Configuration (Step 7)

## Preflight (per explicit instruction, before writing anything)

1. **Linked Vercel project confirmed as `dtcdecoder`** — `.vercel/repo.json` (`"name": "dtcdecoder"`,
   org `team_bxT8GfbWiHrBoP4FTKPgudid`) and `vercel whoami` (authenticated as `thammo01-7973`).
2. **Exact variable names taken from source code**, not `.env.example` or invented:
   - `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` — `src/lib/diagnostic-engine/feature-flags.ts:48`
   - `DIAGNOSTIC_GRAPH_ENABLED`, `QUESTION_ENGINE_ENABLED`, `PROBABILITY_ENGINE_ENABLED`,
     `CONFIDENCE_ENGINE_ENABLED`, `REPAIR_VERIFICATION_ENABLED`, `TEST_PLANNER_ENABLED` — the
     literal string arguments to `flag()` in the `DIAGNOSTIC_ENGINE_FLAGS` object,
     `src/lib/diagnostic-engine/feature-flags.ts:15-20`
   - `DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD`,
     `DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD`, `DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD`,
     `DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD` — `src/lib/diagnostic-engine/budget-guard.ts:77-81`
   - `DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH` — `src/lib/diagnostic-engine/budget-guard.ts:89`
   - All 13 match `.env.example` exactly — no drift found, no alternate spellings used.
3. **No duplicates created**: `vercel env ls production` filtered to these 13 names returned zero
   existing entries before this step — every `vercel env add` was a genuine first addition, not an
   update-over-existing.
4. **Current production rollout confirmed disabled before any change**: with
   `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` unset, `diagnosticEngineRolloutTier()`'s own fallback logic
   (`if (raw === "internal_only" || ... ) return raw; return "disabled";`) means production was
   already behaving as fully disabled by default, prior to this step. This step makes that state
   explicit and intentional rather than incidental.

## Variables set (Production scope only)

| Variable | Value | Purpose |
|---|---|---|
| `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` | `disabled` | Master gate — no caller reaches the engine regardless of module flags |
| `DIAGNOSTIC_GRAPH_ENABLED` | `false` | Module flag |
| `QUESTION_ENGINE_ENABLED` | `false` | Module flag |
| `PROBABILITY_ENGINE_ENABLED` | `false` | Module flag |
| `CONFIDENCE_ENGINE_ENABLED` | `false` | Module flag |
| `REPAIR_VERIFICATION_ENABLED` | `false` | Module flag |
| `TEST_PLANNER_ENABLED` | `false` | Module flag |
| `DIAGNOSTIC_ENGINE_DAILY_BUDGET_USD` | `10` | Global daily budget ceiling |
| `DIAGNOSTIC_ENGINE_MONTHLY_BUDGET_USD` | `100` | Global monthly budget ceiling |
| `DIAGNOSTIC_ENGINE_USER_DAILY_BUDGET_USD` | `2` | Per-user daily budget ceiling |
| `DIAGNOSTIC_ENGINE_USER_MONTHLY_BUDGET_USD` | `20` | Per-user monthly budget ceiling |
| `DIAGNOSTIC_ENGINE_INTERNAL_DAILY_BUDGET_USD` | `5` | Internal-tester daily budget ceiling |
| `DIAGNOSTIC_ENGINE_PROVIDER_KILL_SWITCH` | `false` | Emergency stop, confirmed off |

Applied via `printf '%s' "<value>" | vercel env add <NAME> production` — every value piped through
stdin, never present as a command-line argument, never printed, never written to any file in the
repo. None of these 13 values are secrets (no keys, no credentials) — they're plain configuration
(a tier name, booleans, small integers) — but the same non-printing discipline was followed anyway.

## Verification performed (values cannot be read back — see below)

- **Names and scopes**: `vercel env ls` re-run after the additions; all 13 confirmed listed with
  `Environments: Production` only — no `Preview` or `Development` entry for any of them.
- **Unrelated variables untouched**: `SUPABASE_SERVICE_ROLE_KEY` (`Preview, Production`, age
  unchanged at ~7d), `NEXT_PUBLIC_SUPABASE_URL` (3 separate Dev/Preview/Prod entries, unchanged),
  `ANTHROPIC_API_KEY` (`Production` only, unchanged), `CREEM_API_KEY` (`Production` only,
  unchanged), `ADMIN_ALLOWED_EMAILS` (all 3 environments, unchanged) — none show a new "added"
  timestamp; only the 13 target variables do.
- **Values cannot be read back**: this Vercel project auto-marks new variables as **Sensitive**
  (confirmed by the CLI's own output on every `vercel env add` above — `Type: Sensitive`), which is
  also the root cause of the earlier Phase 2.3 finding that `vercel env pull` returns empty strings
  for every project variable (see
  [PHASE_2_3_ENV_SEPARATION.md](PHASE_2_3_ENV_SEPARATION.md)'s correction) — that mystery is now
  explained, not just worked around. Sensitive variables are write-only by Vercel's own design; this
  is expected, not a gap in this step.
- **Deployment/runtime confirmation deferred to the smoke test**: since values can't be read back
  directly, the real confirmation that these took effect correctly is behavioral — the disabled-
  rollout production smoke test (next step) will exercise the actual deployed app and confirm
  Guided Diagnosis stays unreachable, matching `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=disabled`.

## Deployment note

Vercel bakes a deployment's available environment variables in at build time. The `feature-flags.ts`
module reads these dynamically (`process.env[name]`, not a static literal), which Next.js cannot
inline at build time regardless — but the *set* of variables available to a running deployment is
still fixed when that deployment was built. **The currently-live production deployment predates this
step and predates this entire feature branch** — it has no Diagnostic Engine code at all yet (not
merged), so these 13 variables are inert until a new deployment is built from a commit that includes
the Diagnostic Engine code. No redeploy was triggered as part of this step, since nothing in the
currently-live deployment reads them yet, and no merge to `main` has occurred.

## Result

Preflight passed on all 4 required checks. All 13 variables set to their intended conservative
values, Production-scoped only, no duplicates, no unrelated variable touched, no secret value
printed or persisted anywhere outside Vercel's own encrypted storage.
