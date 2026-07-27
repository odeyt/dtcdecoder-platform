# AI Orchestrator Rollout & Incident Runbook

Staged rollout plan for the multi-model diagnostic orchestrator
(`docs/MULTI_MODEL_ORCHESTRATOR.md`). Every stage below is gated by env vars only — no code
change is required to move between stages, and every stage can be reverted by resetting the
relevant flag(s).

## Emergency rollback (any stage)

```
AI_ORCHESTRATOR_ENABLED=false
```

This alone reverts the app to calling `AnthropicDiagnosticProvider` directly — the exact
pre-orchestrator behavior. No migration rollback is needed: `ai_routing_decisions`
(migration 0029) is additive-only and simply stops receiving new rows.

## Stage A — Local verification

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

Set `AI_ORCHESTRATOR_ENABLED=true` locally with `ANTHROPIC_REVIEW_ENABLED=true` and
`OPENAI_PRIMARY_ENABLED=false` — this exercises the orchestrator's router/budget-guard/
routing-log path while primary generation still uses the already-verified Anthropic path
(the lowest-risk way to confirm the orchestrator's plumbing before introducing a second
live vendor). No customer-facing behavior differs from today in this configuration; only
`ai_routing_decisions` starts being populated.

## Stage B — OpenAI shadow / authorized-pilot

Enable OpenAI as primary only for your own admin/test account by setting
`OPENAI_PRIMARY_ENABLED=true` in a preview/staging environment only, with a real
`OPENAI_API_KEY` and a verified `OPENAI_PRIMARY_MODEL`. Do not enable this in production
until Stage A has run clean in staging for a representative set of real scan-report cases.
Compare `scan_ai_runs.output` / `ai_diagnostic_runs` cost rows between an Anthropic-primary
run and an OpenAI-primary run of the same case (re-run `POST /api/scan-diagnostics/cases/[caseId]/analyze`
with the flag toggled) to sanity-check schema conformance, latency, and cost before any real
customer traffic uses OpenAI.

## Stage C — OpenAI primary pilot (production)

Flip `OPENAI_PRIMARY_ENABLED=true` in production. `ANTHROPIC_REVIEW_ENABLED` stays `true` —
Anthropic reviews only the cases the router actually escalates (~15-25% expected rate, see
`docs/MULTI_MODEL_ORCHESTRATOR.md`). Gemini stays disabled. Monitor:

- `ai_routing_decisions.reason_code` distribution — most cases should be `PRIMARY_ONLY`.
- `ai_diagnostic_runs.status = 'failed'` rate for `provider_id = 'openai-primary'`.
- `ai_diagnostic_runs.estimated_total_cost_micros` — actual OpenAI cost vs. the
  `OPENAI_INPUT_PER_MILLION_USD`/`OPENAI_OUTPUT_PER_MILLION_USD` estimate, once real billing
  data is available (see `docs/AI_PROVIDER_CONFIGURATION.md`).

## Stage D — Controlled production (steady state)

Once Stage C is stable (no elevated failure/escalation rate over a representative period),
this is the expected steady-state configuration:

```
AI_ORCHESTRATOR_ENABLED=true
OPENAI_PRIMARY_ENABLED=true
ANTHROPIC_REVIEW_ENABLED=true
GEMINI_PROVIDER_ENABLED=false
```

Keep the kill switch (`AI_ORCHESTRATOR_ENABLED=false`) documented and known to whoever is
on call — it is the single fastest rollback path from any problem in this configuration.

## Stage E — Gemini multimodal pilot (future, not built yet)

Not implemented in this pass — `GeminiDiagnosticProvider` is a scaffold that throws if ever
called. Enabling this stage requires: adding a real Gemini SDK dependency (version-verified
against what's actually installed, per this feature's own "never invent SDK methods" rule),
implementing a real multimodal call, and restricting it to supported file types and eligible
plans, all as a separate follow-up piece of work.

## Incident response

**A provider is failing at an elevated rate:**
- OpenAI primary failing: set `OPENAI_PRIMARY_ENABLED=false` — primary generation reverts to
  Anthropic immediately, no other change needed.
- Anthropic reviewer failing: set `ANTHROPIC_REVIEW_ENABLED=false` — the orchestrator
  continues serving primary-only results (a review-call failure was already handled
  gracefully even with this flag on: see `orchestrator.ts`'s `PROVIDER_FAILURE` fallback path,
  which never fails the whole case).
- Both unavailable, or the whole orchestrator is suspect: `AI_ORCHESTRATOR_ENABLED=false`.

**Spend is higher than expected:**
- Set the relevant `AI_*_BUDGET_USD` variable(s) if not already configured — this takes
  effect on the next request with no deploy needed (env vars are read fresh; see
  `docs/AI_BUDGET_GUARD.md`).
- The pre-existing per-request `COST_GUARDS.hardCeilingUsd` (`src/lib/pricing.ts`) already
  rejects any single request estimated to cost more than $1.50, independent of the
  orchestrator.

**Key rotation:** rotate `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY` in your
deployment platform's environment variable settings and redeploy — no code or database
change is needed, since every provider reads its key from `process.env` at call time, never
caching it.

## Data retention

`ai_routing_decisions` rows are never deleted automatically. They contain no PII beyond a
`case_id` foreign key and short `reason_code`/`explanation` text — the same retention posture
as the pre-existing `ai_diagnostic_runs` cost ledger.
