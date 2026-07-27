# Landing Diagnostic Intake

The unauthenticated intake flow that fronts the new landing hero
(`LandingDtcTechnician`, Slice 2) and its backing deterministic engine
(Slice 3). See docs/PHASE_1_DTC_TECHNICIAN_AUDIT.md for what pre-existing
infrastructure this reuses.

## Flow

```
Visitor types a message or clicks a prompt chip
  → POST /api/public/diagnostic-intake { message, intake }
  → src/lib/landing-intake/engine.ts processPublicIntake()
      — deterministic state machine, NEVER calls a paid AI provider
  → response.status drives the next UI state:
      needs_more_information → ask the next focused question
      basic_result           → show local DTC data + locked-preview cards
      upgrade_required        → free-tier limit reached
      sign_in_required        → hand off to authentication
```

## State machine (`processPublicIntake`)

| `currentStep` | Input parsed as | Next question / outcome |
|---|---|---|
| `issue` (initial) | DTC code (regex) | Found → ask vehicle info (`vehicle` step). Not found → ask for a code once more (`issue_retry`). |
| `issue_retry` | DTC code | Found → ask vehicle info. Still not found → **basic_result** immediately (generic guidance) rather than a third round — "do not force every field before providing basic value." |
| `vehicle` | Year (regex) + first/rest word heuristic for make/model | Ask current-vs-history status (`status`) |
| `status` | Keyword match (current/history/pending/permanent) → else `unknown` | Ask main complaint (`complaint`) |
| `complaint` | Free text, stored as `complaint` | Runs the DTC lookup → **basic_result**, or **upgrade_required** if the free allowance is exhausted |
| `complete` | (any message) | **sign_in_required** — a basic result was already shown; anything beyond it needs authentication |

Vehicle field parsing is a **heuristic word-split**, not a VIN decode or
vehicle-data lookup — documented as such in the engine, never presented as
verified.

## Cost control

`processPublicIntake` has no import of, or call path to, any AI provider
module (`anthropic-provider`, `openai-provider`, `gemini-provider`,
`ai-diagnostics/{cost,usage,orchestrator}`) — pinned by a source-scan test
(`test/landing-intake-engine.test.ts`, "never calls a paid provider").

The one cost-relevant action — the actual DTC lookup — reuses the
**existing** free-tier ledger (`src/lib/basic-search/usage.ts`,
`hasBasicSearchAllowanceRemaining`/`recordBasicSearchUsage`, 3/day + 10/month
on Free, unlimited on paid), the same one `/dtc` already enforces. A visitor
can't get a second, uncounted allowance by going through the intake
endpoint instead of `/dtc` directly.

No dedicated per-IP rate limiter was added for the conversational steps
themselves (issue/vehicle/status) — the state machine's own bounded depth
(a handful of round trips before hitting either the rate-limited lookup or
the `sign_in_required` terminal state) is the abuse bound. A dedicated
per-IP/per-anon-id limiter on the intake endpoint itself is a reasonable
Phase 2 hardening item if real abuse is observed.

## Authenticated handoff

`POST /api/diagnostics/create-from-intake` (Slice 4) — the only path from
an anonymous intake into a real, saved diagnostic case:

1. Requires auth (401 otherwise).
2. Validates the intake body against the same `IntakeSchema` the public
   endpoint uses (`src/lib/landing-intake/schema.ts`).
3. Requires an identified DTC code (`422 NO_DTC_CODE` otherwise — the
   client falls back to Import Vehicle Scan).
4. Calls `createQuickDiagnosticCase` **directly** — deliberately NOT the
   pre-existing `/api/scan-diagnostics/cases/quick` route, which also
   immediately runs `runScanAnalysis` (paid AI analysis) and hard-blocks
   the Free plan. Any signed-in user, regardless of plan, gets their case
   saved; running the actual paid analysis remains a separate, already-
   gated action from the case page.
5. Returns `{ caseId }`; the client redirects to `/diagnostics/{caseId}`.

Intake state crosses the sign-in boundary via `sessionStorage`
(`LANDING_INTAKE_STORAGE_KEY`), **never the URL** — the sign-in redirect
target is `/account/login?next=%2Fdiagnostics%2Ffrom-intake`, and
`/diagnostics/from-intake` (a client page) reads the stored intake, calls
the handoff endpoint, and clears the storage key on success.

## Free vs. paid behavior

| | Unauthenticated | Authenticated Free | Authenticated Pro/Workshop |
|---|---|---|---|
| Basic DTC definition, generic symptoms/causes/checks, safety warning | ✅ (rate-limited, 3/day·10/month) | ✅ (same limit) | ✅ (unlimited) |
| Vehicle-specific root-cause ranking / Professional Diagnostic Report | ❌ | ❌ (locked preview shown) | ✅ (within monthly/daily plan allowance) |
| Create a saved diagnostic case | Requires sign-in first | ✅ | ✅ |
| Run the actual paid analysis on that case | N/A | ❌ (existing entitlement gate) | ✅ |

## Known limitations

- Vehicle year/make/model parsing is a simple heuristic (first word = make,
  rest = model) — not a vehicle-data lookup. Documented in `engine.ts`.
- No dedicated per-IP rate limiter on the conversational (non-lookup) steps
  — see "Cost control" above for why this was judged acceptable for Phase 1.
