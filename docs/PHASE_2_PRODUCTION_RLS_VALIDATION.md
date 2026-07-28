# Phase 2 — Real Production RLS Validation (Step 6)

Executed against the confirmed production Supabase project (`sysbwmiguyxwzufwxwpq`) using real
Postgres RLS and real Supabase Auth sessions — not `FakeSupabase` mocks. Two synthetic,
non-customer accounts were created for this test only
(`dtc-rls-test-{a,b}-<timestamp>@dtcdecoder-internal-test.invalid`, random passwords never
logged), used to exercise cross-user access attempts, then fully deleted afterward along with
every row they touched. Post-test cleanup was independently re-verified: pre-existing table row
counts are exactly unchanged (`scan_cases=4`, `ai_diagnostic_usage=5`, `analytics_events=40`,
`ai_routing_decisions=0`), all new tables are back to 0 rows, and zero test accounts remain.

## Finding and fix applied before this validation completed

While testing the usage RPCs, found that `get_diagnostic_engine_usage_summary` and
`record_diagnostic_engine_usage` (migration 0032) were `security definer` with no identity check —
reachable directly via the public anon key regardless of the app only ever calling them through the
service-role client. `record_diagnostic_engine_usage` could insert a usage row attributed to an
arbitrary other real user (a targeted quota-exhaustion vector); `get_diagnostic_engine_usage_summary`
could return another user's real turn-usage counts. Fixed via migration
[0036_diagnostic_engine_usage_rpc_authorization.sql](../supabase/migrations/0036_diagnostic_engine_usage_rpc_authorization.sql)
(applied to production before this validation's results below were captured), which requires either
`auth.role() = 'service_role'` (the app's only real call path) or `auth.uid() = p_user_id`. The
identical pre-existing pattern in migration 0016's older `ai_diagnostic_usage` functions is flagged
as a separate follow-up, not fixed as part of this release.

One methodology error along the way, corrected before accepting a result: the first test pass
asserted `rows.length === 0` to mean "blocked" for `get_diagnostic_engine_usage_summary`, but that
function is an aggregate (`COUNT(*)`) query, which always returns exactly one row even when its
`WHERE` clause matches nothing (`COUNT` of zero rows is `0`, not an empty result set). That
assertion was wrong regardless of whether the fix worked, and user A had no real recorded usage in
the first pass, making the result ambiguous either way. Re-ran with a real, known non-zero usage
row inserted for user A first, then checked the actual returned *value* — see results below.

## Results — 11/11 checks passed

### Table-level RLS (real Postgres policies, real signed-in sessions)

| Check | Result |
|---|---|
| Owner (A) can read their own `diagnostic_evidence` | PASS |
| Owner (A) can read their own `diagnostic_graph` | PASS |
| A's unfiltered `select * from diagnostic_evidence` (no `case_id` filter) returns only A's own row, not any other data | PASS |
| User B cannot read A's `diagnostic_evidence` (0 rows returned) | PASS |
| User B cannot read A's `diagnostic_graph` (0 rows returned) | PASS |
| User B cannot `INSERT` evidence into A's case (denied, Postgres `42501`) — proves there is no `INSERT` policy for the `authenticated` role on this table, matching the app's service-role-only write architecture | PASS |
| Anonymous (no session) cannot read A's `diagnostic_evidence`, with a **real row present** (unlike the earlier pre-migration probe against an empty table, this is a conclusive result) | PASS |

### RPC-level authorization (migration 0036, exercised for real)

| Check | Result |
|---|---|
| A can call `get_diagnostic_engine_usage_summary` for their own id and see their real count (`used_today = 1`, a known value inserted directly for this test) | PASS |
| User B calling the same RPC with A's id sees `used_today = 0`, **not** A's real value of 1 | PASS |
| Anonymous calling the same RPC with A's id sees `used_today = 0`, not A's real value | PASS |
| User B cannot call `record_diagnostic_engine_usage` as A (denied, Postgres `42501: not authorized`) | PASS |

## Server-side ownership (code-level, unchanged by this release, re-confirmed by reading the source)

- `src/lib/diagnostic-engine/usage.ts` — both usage RPCs are called exclusively via
  `createAdminClient()` (service role); no call site accepts or forwards a client-supplied user id
  from request input — `userId` always comes from the server's own verified session lookup.
- `src/lib/diagnostic-engine/question.ts`'s `recordAnswer` verifies `(questionId, caseId)` together
  before writing (Phase 2.1 fix, unchanged this release) — a client cannot answer a question
  belonging to a different case by supplying an arbitrary `questionId`.
- `getCaseForOwner`-style ownership checks (established Phase 0/1 pattern) remain the real
  write-side boundary everywhere in this codebase; this release didn't change that architecture,
  only added new tables that follow the identical owner-read RLS convention.
- No client-supplied `shopId` concept exists anywhere in this codebase (single-user-per-account
  model, no organizations/shops table) — not applicable.

## Conclusion

No cross-user data access exists in the current production schema. One real gap was found and
fixed before this validation was finalized (migration 0036); it is documented above rather than
omitted. All test artifacts were removed and independently re-verified as fully cleaned up.
