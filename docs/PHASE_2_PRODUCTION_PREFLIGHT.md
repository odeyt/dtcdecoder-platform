# Phase 2 — Direct Production Release: Preflight (Step 1)

Owner authorization on record: proceed directly to production without a separate staging Supabase
project, owner-internal-only initial rollout, general-user access disabled throughout.

## Repository checks

| Check | Result |
|---|---|
| Repository is DTC Decoder | Confirmed (`package.json` name `dtcdecoder`, working directory `C:\Users\wallyd1\DTC DECODER`) |
| Current branch | `feature/phase-2-ai-diagnostic-engine` |
| Remote branch up to date | Confirmed — `origin/feature/phase-2-ai-diagnostic-engine` matches local `HEAD` before this preflight's own commits |
| No unrelated repository open | Confirmed — single working tree, no nested/sibling repo checked out |
| No Redlined1 files modified | Confirmed — zero matches for `redlined1`/`REDLINE` anywhere in the branch diff |
| No Sapelee files modified | Confirmed — zero matches for `sapelee`/`ai-founder-cloud` anywhere in the branch diff |
| `.claude/launch.json` not staged | Confirmed — shows as locally modified only, never staged in any commit |
| No `.env` file staged | Confirmed — the only `.env*` file in the branch diff is `.env.example` (template, placeholder values) |
| No secrets in branch diff | Confirmed — pattern scan for API-key/JWT/PEM-key/connection-string shapes across the full `main...HEAD` diff returned zero matches |
| Production Vercel project is `dtcdecoder` | Confirmed via `vercel whoami` / `.vercel/repo.json` — project `dtcdecoder`, org `team_bxT8GfbWiHrBoP4FTKPgudid` |
| Production Supabase project identity | Confirmed by the project owner directly (verified through the Vercel/Supabase dashboards, since this session cannot read actual Vercel-configured secret values — see [PHASE_2_3_ENV_SEPARATION.md](PHASE_2_3_ENV_SEPARATION.md) for why): project ref `sysbwmiguyxwzufwxwpq` is production |
| `main` remains the production deployment branch | Confirmed — `origin/main` / `origin/HEAD` both point at the same commit (`8caf796`), no other branch is configured as Vercel's production branch in `.vercel/repo.json` |

## Verification suite

```
npx tsc --noEmit    →  clean
npm run lint         →  clean
npx vitest run       →  686/686 passed (76 test files)
npm run build        →  production build succeeded
```

Re-run after the migration-idempotency edits in this same session (SQL-file-only changes, no
TypeScript/component change) — `tsc` and the full test suite were re-confirmed clean.

## Production migration-history finding (Step 2 preview — full detail in the runbook)

A read-only probe (this app's own service-role key, against the confirmed-production project,
select-only, no writes) found: `analytics_events`, `ai_diagnostic_usage`, and
`ai_routing_decisions` already exist (migrations 0001–0029 baseline present). The six Phase 2 core
tables (0031), `diagnostic_engine_usage` (0032), and `diagnostic_engine_runs` (0033) do **not**
exist yet — these migrations are genuinely pending, matching the phase brief's own warning not to
assume otherwise. Full detail, dependency order, and a SQL-Editor introspection script that can see
what REST cannot (constraint text, RLS policies, indexes) are in
[PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md](PHASE_2_PRODUCTION_MIGRATION_RUNBOOK.md) and
[PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql](PHASE_2_PRODUCTION_PREFLIGHT_INTROSPECTION.sql).

## Migration safety hardening performed this step

Before presenting any SQL for the owner to run, all six pending migration files
(`supabase/migrations/003{0,1,2,3,4,5}_*.sql`) were rewritten to be idempotent, per explicit owner
instruction: every `CREATE TABLE`/`CREATE INDEX` now uses `IF NOT EXISTS`; every constraint swap
now uses `DROP CONSTRAINT IF EXISTS` before an unconditional `ADD CONSTRAINT`; both 0032 functions
already used (and still use) `CREATE OR REPLACE`; every `CREATE POLICY` is now preceded by `DROP
POLICY IF EXISTS` (Postgres has no `CREATE POLICY IF NOT EXISTS`). Rerunning any file after a
partial or full prior application is safe and converges to the same end state — see the runbook's
own header comment in each migration file for the specific reasoning per file.

## Execution method

No Supabase CLI credential, database connection string, or SQL-execution RPC exists anywhere in
this repository or environment (confirmed by direct check: `supabase` CLI unauthenticated with no
access token available, no `DATABASE_URL` anywhere, no `pg`/`postgres` client dependency). Every
prior migration in this project's history was applied the same way this one will be: the project
owner pastes the exact, reviewed SQL into the Supabase Dashboard SQL Editor. This session prepares
and reviews the SQL; the owner executes it.

## Conclusion

Preflight passes. Proceeding to prepare the exact migration order and verification/rollback
procedure (already written into the runbook) for the owner to execute.
