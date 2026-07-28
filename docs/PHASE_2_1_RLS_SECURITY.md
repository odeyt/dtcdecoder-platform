# Phase 2.1 — RLS and Case-Ownership Security

## The model: RLS protects reads, application code protects writes

Every user-owned table in this codebase (since migration 0012) follows the same pattern: RLS
enabled, exactly one `for select using (...)` policy, and **no `insert`/`update`/`delete`
policies anywhere**. All writes go through `createAdminClient()` (the Supabase service-role key)
from `server-only` modules — never through a user's own browser session. Under Postgres RLS, a
table with RLS enabled and only a `select` policy implicitly denies every other operation to a
non-service-role caller; the service role bypasses RLS entirely, which is how every write in this
app has always worked, in every phase.

**Consequence: RLS is not the mechanism that stops a signed-in user from writing to another
user's case.** It protects against a hypothetical future direct-client read. The actual security
boundary — for both Phase 0/1's existing tables and Phase 2's six new ones — is: **every
service-role write is preceded by an application-layer ownership check**, and that has to hold
function-by-function, not be assumed from the schema. This document audits that boundary for
every Phase 2 table and route.

## RLS policies present (migration 0031)

| Table | Policy | Condition |
|---|---|---|
| `diagnostic_evidence` | `diagnostic_evidence_owner_read` | `exists (select 1 from scan_cases c where c.id = case_id and c.user_id = auth.uid())` |
| `diagnostic_graph` | `diagnostic_graph_owner_read` | same case-join pattern |
| `diagnostic_questions` | `diagnostic_questions_owner_read` | same |
| `diagnostic_answers` | `diagnostic_answers_owner_read` | same |
| `diagnostic_probabilities` | `diagnostic_probabilities_owner_read` | same |
| `repair_verifications` | `repair_verifications_owner_read` | same |

Identical shape to the pre-existing `scan_systems_owner_read`/`scan_patterns_owner_read` policies
(migration 0028) — no new pattern introduced. **Unauthenticated (anon-key, no session) requests
have no matching `auth.uid()` and are denied by every one of these policies** — an anonymous
caller reading any of these tables directly gets zero rows, same as for every existing
Phase 0/1 table.

## Application-layer ownership check, audited per write path

| Function | Takes a client-supplied foreign id? | Ownership enforced by |
|---|---|---|
| `ensureInitialEvidence` / `insertEvidence` | No — only `caseId`, itself already verified by the caller | `runDiagnosticEngineTurn`'s `getCaseForOwner` call, before any of these run |
| `recordQuestion` | No — `candidate` is server-selected from the fixed `QUESTION_BANK`, never client input | Same — orchestrator selects the question itself |
| `saveGraph` / `saveHypotheses` | No — keyed strictly on the caller's own `caseId` | Same |
| `recordAnswer` | **Yes — `questionId`, client-supplied via the `/answers` route body** | **Fixed in this phase — see below** |
| `updateRepairVerificationItem` | No — filters its own update by `case_id` directly, never trusts a separate id | Route's `getCaseForOwner` call |

### Finding and fix: `recordAnswer` cross-case write

Found during the Step 1 audit ([PHASE_2_1_INTEGRATION_AUDIT.md](PHASE_2_1_INTEGRATION_AUDIT.md)
§3a): `recordAnswer(questionId, caseId, ...)` accepted a client-supplied `questionId` and updated
`diagnostic_questions SET answered = true WHERE id = questionId` with no `case_id` filter. Since
the `/answers` route's `getCaseForOwner` check only verifies the **case** in the URL belongs to
the caller, not that the **question** in the body belongs to that case, a user who owns case A
and knows (or enumerates) a `diagnostic_questions.id` from case B could submit an answer against
their own case A while pointing `questionId` at B — inserting a `diagnostic_answers` row and
flipping B's question to `answered`, corrupting another user's case state.

**Fix applied** (`src/lib/diagnostic-engine/question.ts`): `recordAnswer` now looks up the
question row filtered by **both** `id` and `case_id` before doing anything else, and throws
`ScanCaseNotFoundError` (the same error/response shape as "case not found," giving no signal about
whether the id is invalid vs. belongs to someone else) if it doesn't match. The subsequent
`update` is also filtered by `.eq("case_id", caseId)` as defense in depth. Covered by:

- `test/diagnostic-engine-question.test.ts` — `"rejects an answer whose questionId belongs to a
  different case"` (unit-level, direct function call).
- `test/diagnostic-engine-security.test.ts` — `"rejects an answer whose questionId belongs to a
  case the caller does own a DIFFERENT case in, via the real route"` (route-level, through the
  actual `POST /answers` handler).

## Automated cross-user access tests (Step 3)

Since this repo's test suite runs entirely against an in-memory `FakeSupabase` mock (no live
Postgres — see `test/mocks/fake-supabase.ts`), it cannot execute real RLS policies. "RLS tests"
here are, correctly, tests of the **application-layer ownership boundary** described above — the
actual thing that gates every write. `test/diagnostic-engine-security.test.ts` exercises the real
`/api/diagnostic-engine/v1/*` route handlers (not just library functions) for:

- Unauthenticated caller → `401`, before any Diagnostic Engine module runs, for `/turn`,
  `/answers`, and all three `/repair-verification` methods.
- Caller authenticated as a *different* user than the case owner → `404` (indistinguishable from
  "not found," never leaking that the case exists), before any table is written to.
- The `recordAnswer` cross-case scenario above, exercised through the real route.

`test/diagnostic-engine-orchestrator.test.ts` additionally covers `getCaseForOwner` rejection at
the orchestrator layer directly (`runDiagnosticEngineTurn` throwing `ScanCaseNotFoundError`
before touching evidence/graph/questions).

**What is NOT covered by this test suite:** actual Postgres RLS enforcement (requires a live
Supabase instance — not available in this environment) and PostgREST-level direct-table access
(this app never queries these tables via the anon key from the client today, so there is no code
path to test, but if one is ever added, it must be exercised against a real project, not the fake
mock, before shipping).

## Never trust client-supplied identity or entitlement state

Confirmed for every Phase 2/2.1 route: `userId` always comes from
`supabase.auth.getUser()`'s server-verified session (`createClient()` from
`@/lib/supabase/server`), never from a request body or query parameter. No route in
`/api/diagnostic-engine/v1/*` accepts a `userId`, `shopId`, `ownerId`, or plan/entitlement field
from the client — plan resolution (Step 4) reads `getEffectivePlan(user.id, user.email)`
server-side, matching every existing AI-calling route in this codebase (`analyze/route.ts`,
`assistant/route.ts`).

## Service-role and admin access

`createAdminClient()` (the service-role key) is only ever imported from `server-only`-marked
modules under `src/lib/`, never from a client component or a route that doesn't itself first
authenticate the caller — consistent with every existing feature. Admin-only surfaces
(`/admin/*`) already gate through `requireAdmin()`/`isAllowedAdminEmail()`
(`ADMIN_ALLOWED_EMAILS`); Phase 2.1's internal-rollout allowlist (Step 7,
[PHASE_2_1_RELEASE_PLAN.md](PHASE_2_1_RELEASE_PLAN.md)) uses the same pattern with a **separate**
env var (`DIAGNOSTIC_ENGINE_ALLOWED_EMAILS`) rather than reusing `ADMIN_ALLOWED_EMAILS` — an
internal diagnostic tester is not necessarily an admin, and conflating the two would either
under-grant testers or over-grant admin surface access.

## Shop/org scoping — not applicable

No `shopId`/organization/multi-tenant concept exists anywhere in this codebase (confirmed by
grep across `src/lib`) — every account is single-user. The Workshop plan's `technicianSeatLimit`
is a numeric entitlement field only; no shared-case-visibility mechanism is implemented (see
[PRICING_AND_ENTITLEMENTS.md](PRICING_AND_ENTITLEMENTS.md)'s existing disclosure on this). There
is nothing to scope by shop membership today.
