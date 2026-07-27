# AI Provider Configuration

Environment variables for the multi-model diagnostic orchestrator
(`docs/MULTI_MODEL_ORCHESTRATOR.md`). All of these are additive to the pre-existing
`ANTHROPIC_API_KEY` (still required, still used identically to before this feature).

Never commit real values for anything marked **Sensitive** — `.env.example` ships only
placeholder/empty values, per this repo's existing convention.

## Master switch

| Variable | Required | Sensitive | Default | Notes |
|---|---|---|---|---|
| `AI_ORCHESTRATOR_ENABLED` | No | No | `false` | Must be `true` for anything else in this doc to have any effect. With it `false`, `analyze.ts` calls the existing `AnthropicDiagnosticProvider` directly — no orchestrator module is even imported into that code path. |

## OpenAI (configurable primary)

| Variable | Required | Sensitive | Default | Notes |
|---|---|---|---|---|
| `OPENAI_API_KEY` | Only if `OPENAI_PRIMARY_ENABLED=true` | **Yes** | — | Server-only; never sent to the browser. |
| `OPENAI_PRIMARY_MODEL` | Only if `OPENAI_PRIMARY_ENABLED=true` | No | — | No default — never invented. Must be a real, currently-supported OpenAI model id you have access to. |
| `OPENAI_FALLBACK_MODEL` | No | No | — | Optional. Gets exactly one retry attempt after a transient (5xx/408/429) primary-model failure — never after a validation failure or a deterministic client error (400/401). |
| `OPENAI_PRIMARY_ENABLED` | No | No | `false` | Disabled by default — Anthropic remains primary until explicitly flipped. |

## Anthropic (reviewer)

| Variable | Required | Sensitive | Default | Notes |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (pre-existing) | **Yes** | — | Reused for both the primary role (when OpenAI is disabled) and the reviewer role. |
| `ANTHROPIC_REVIEW_ENABLED` | No | No | `true` | Opt-**out**, not opt-in — once the orchestrator itself is on, a review is the conservative default. Has zero effect while `AI_ORCHESTRATOR_ENABLED=false`. |

## Gemini (disabled scaffold)

| Variable | Required | Sensitive | Default | Notes |
|---|---|---|---|---|
| `GEMINI_API_KEY` | No (never required — the provider throws if ever called, but is never called while disabled) | **Yes** | — | No Gemini SDK is installed. |
| `GEMINI_MULTIMODAL_MODEL` | No | No | — | Reserved for future use. |
| `GEMINI_PROVIDER_ENABLED` | No | No | `false` | The only supported value today. Setting `true` without a real Gemini integration will cause `GeminiDiagnosticProvider` to throw `GeminiNotEnabledError` if the registry ever selects it — it is not wired to any real multimodal call yet. |

## Fixed role assignment (documented, not env-driven)

| Variable | Required | Sensitive | Notes |
|---|---|---|---|
| `AI_PRIMARY_PROVIDER=openai` | No | No | Documentation only — the actual selection logic is `OPENAI_PRIMARY_ENABLED`, not this string. |
| `AI_REVIEW_PROVIDER=anthropic` | No | No | Fixed; there is only one reviewer implementation. |
| `AI_MULTIMODAL_PROVIDER=gemini` | No | No | Fixed; reserved for the future Gemini role. |

## Router thresholds

All optional — see `src/lib/ai-diagnostics/orchestrator-config.ts` for defaults, all
read fresh from `process.env` on every call (never cached at import time).

| Variable | Default | Notes |
|---|---|---|
| `AI_REVIEW_CONFIDENCE_THRESHOLD` | `0.72` | Fraction (0-1). Below this internal confidence score, the router escalates to review. |
| `AI_HUMAN_REVIEW_CONFIDENCE_THRESHOLD` | `0.45` | Below this, the case is flagged for human review regardless of the reviewer's own decision. |
| `AI_QUALITY_AUDIT_PERCENT` | `5` | % of otherwise-primary-only cases randomly (but stably, per caseId) sampled for review. |
| `AI_MAX_ESCALATIONS_PER_CASE` | `1` | Clamped to 0 or 1 — never more than one review round. |

## Per-request limits

| Variable | Default | Notes |
|---|---|---|
| `AI_MAX_PRIMARY_INPUT_TOKENS` | `12000` | |
| `AI_MAX_PRIMARY_OUTPUT_TOKENS` | `4096` | |
| `AI_MAX_REVIEW_INPUT_TOKENS` | `8000` | |
| `AI_MAX_REVIEW_OUTPUT_TOKENS` | `2048` | |
| `AI_MAX_REQUESTS_PER_CASE` | `2` | Clamped to a max of 2 — one primary + one review, never more. |
| `AI_PROVIDER_TIMEOUT_MS` | `30000` | Passed to the OpenAI SDK client's `timeout` option. |
| `AI_PROVIDER_MAX_RETRIES` | `1` | Passed to the OpenAI SDK client's `maxRetries` option (its own built-in policy skips retrying deterministic 4xx errors). |

## Budget guard (owner-level, overrides plan entitlements)

Every value in this section is **optional** — an unset dimension is skipped entirely, never
treated as an implicit $0 ceiling. See `docs/AI_BUDGET_GUARD.md` for full behavior.

| Variable | Default | Notes |
|---|---|---|
| `AI_DAILY_BUDGET_USD` | unset | Owner-wide, across every user. |
| `AI_MONTHLY_BUDGET_USD` | unset | Owner-wide, across every user. |
| `AI_PER_CASE_BUDGET_USD` | unset | Documented for parity; per-case is already covered by the pre-existing `COST_GUARDS.hardCeilingUsd` (`src/lib/pricing.ts`), not a second mechanism. |
| `AI_PER_USER_DAILY_BUDGET_USD` | unset | |
| `AI_PER_SHOP_MONTHLY_BUDGET_USD` | unset | No shop entity exists — evaluated as an alias of the requesting user's own monthly spend. |
| `AI_BUDGET_WARNING_PERCENT` | `75` | |
| `AI_BUDGET_RESTRICT_PERCENT` | `90` | |
| `AI_BUDGET_HARD_STOP_PERCENT` | `100` | |

## Cost-ledger pricing overrides

Optional — omit to use the built-in conservative estimates (`src/lib/ai-diagnostics/cost.ts`),
which are clearly marked as estimates, never presented as verified real-world pricing.

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_INPUT_PER_MILLION_USD` / `OPENAI_OUTPUT_PER_MILLION_USD` | unset | Both must be set together to take effect for a configured OpenAI model. |
| `ANTHROPIC_INPUT_PER_MILLION_USD` / `ANTHROPIC_OUTPUT_PER_MILLION_USD` | unset | Overrides only the Sonnet-tier rate (the model this app's Anthropic diagnostic/reviewer role uses) — the Haiku economical tier keeps its own built-in rate. |
| `ANTHROPIC_CACHED_INPUT_PER_MILLION_USD` | unset | Reserved — this app's cost ledger does not yet model a separate cached-token rate; cached tokens are billed at the input rate (see `cost.ts`'s own documented caveat). |
| `GEMINI_INPUT_PER_MILLION_USD` / `GEMINI_OUTPUT_PER_MILLION_USD` | unset | Both must be set together to take effect for a configured Gemini model. |

## Development-only vs. production-required

- **Local dev**: every variable above may be left unset — the orchestrator itself stays
  disabled (`AI_ORCHESTRATOR_ENABLED=false` default) and the app behaves exactly as it did
  before this feature.
- **Production, orchestrator enabled**: `AI_ORCHESTRATOR_ENABLED=true` plus, if
  `OPENAI_PRIMARY_ENABLED=true`, both `OPENAI_API_KEY` and `OPENAI_PRIMARY_MODEL` become
  effectively required (the provider throws a clear `OpenAiConfigurationError`, not a silent
  failure, if either is missing).
- **Never required**: everything Gemini-related, and every budget/pricing-override variable.
