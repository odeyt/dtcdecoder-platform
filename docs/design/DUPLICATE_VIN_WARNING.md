# Duplicate-VIN Charge Warning

Audit + fix for a gap where a customer re-running a diagnostic case for a
VIN they'd already diagnosed was silently charged again — a new usage
slot or purchased-report credit consumed for every case, with no
detection tying cases to the same vehicle at all. This document covers
the feature as shipped: the lookup, both charge-point integrations, the
response/confirm contract, the UI, and tests.

## Problem

`scan_cases`/`scan_extractions` had zero uniqueness or lookup tying a VIN
to a user's prior cases. `record_ai_diagnostic_usage` and
`redeemSingleReportPurchase` key exclusively on `caseId` — a second case
for an already-diagnosed VIN silently consumed a brand-new
credit/usage slot, with no warning to the customer that they'd already
run this vehicle before.

This is a **soft warning, not a hard block**. A customer might
legitimately have a second, unrelated issue on the same vehicle — the
fix surfaces the prior case(s) and lets them decide, rather than
refusing the request outright.

## Detection

`findExistingCasesForVin(userId, vin, excludeCaseId?)`
(`src/lib/scan-diagnostics/cases.ts`) — the single lookup both charge
points share:

- VIN comparison is trim + uppercase. `scan_extractions.vin` is free
  text (user-typed on the quick form, or parsed from an uploaded scan
  report) and was never normalized at write time, so an exact `.eq()`
  match isn't reliable.
- Scoped to `userId` — never returns another user's cases.
- `excludeCaseId` omits the case currently being analyzed (used by the
  analyze route, see below) so a case is never reported as a duplicate
  of itself.
- Cases with no `scan_extractions` row at all (e.g. still `draft`) can
  never match — excluded implicitly, no special-casing needed.
- Returns `ExistingVinCase[]` (`id`, `status`, `complaint`, `createdAt`),
  sorted newest first, for whichever cases actually match.
- Blank/whitespace-only VIN short-circuits to `[]` without querying
  anything.

`getVinForCase(caseId)` — a second, narrower helper used only by the
analyze route's pre-flight check (below), since that route doesn't
receive the VIN as input; it has to look up what was already extracted
for the case. Ownership is enforced by the caller (`getCaseForOwner`),
not by this function.

## Response contract

`DuplicateVinError` (`src/lib/scan-diagnostics/api-errors.ts`) — added to
the shared `toSafeErrorResponse` error taxonomy alongside every other
scan-diagnostics error type. Maps to:

```
409 { error: "You already have a case for this VIN.", code: "DUPLICATE_VIN", vin, existingCases }
```

`existingCases` is the `ExistingVinCase[]` from the lookup above — enough
for the client to render "you already have a case for this VIN" with a
link to each one, without a second round-trip.

Both charge-point routes accept an optional `confirmDuplicateVin: boolean`
in the request. When `true`, the duplicate check is skipped entirely and
the request proceeds as normal — this is how "continue anyway" resubmits
after the warning.

## Charge-point integrations

There are exactly two places a case's analysis actually consumes a
usage slot or purchased-report credit (`runScanAnalysis` in `analyze.ts`)
— see `docs/ONE_TIME_PROFESSIONAL_REPORT.md` for the credit model itself.
Both were audited and both needed the check; neither needed
`runScanAnalysis` itself touched.

### Quick-diagnostic route (`POST /api/scan-diagnostics/cases/quick`)

VIN is known upfront (`QuickDiagnosticCaseInputSchema.vin`, optional —
this entry point doesn't require a VIN at all). The check runs **before**
`createQuickDiagnosticCase`, so a detected duplicate never creates a case
at all:

```
if (parsed.data.vin && !parsed.data.confirmDuplicateVin) {
  const existingCases = await findExistingCasesForVin(user.id, parsed.data.vin);
  if (existingCases.length > 0) throw new DuplicateVinError(parsed.data.vin, existingCases);
}
```

A submission with no VIN is never treated as a duplicate of anything —
there's nothing to compare.

### Analyze route (`POST /api/scan-diagnostics/cases/[caseId]/analyze`)

This is the upload flow's actual charge point — VIN isn't known until
after extraction/review, so the case already exists by the time this
route runs. Sequence:

1. `getCaseForOwner(user.id, caseId)` — ownership check, same as every
   other mutation on a case.
2. Parse an optional JSON body for `confirmDuplicateVin` (the route
   previously took no body at all — a normal "Start AI diagnostic
   analysis" click still sends none, which is treated as "not
   confirmed," not an error).
3. If not confirmed: `getVinForCase(caseId)` → if a VIN exists,
   `findExistingCasesForVin(user.id, vin, caseId)` (excluding itself) →
   throw `DuplicateVinError` if any match.
4. Only then does `runScanAnalysis` run.

A case with no VIN extracted (rare, but possible for a low-quality scan
report) skips the check entirely — nothing to compare.

## UI

Both client entry points that call these routes handle the `409
DUPLICATE_VIN` response the same way: a warning panel listing the
existing case(s) as links (`/diagnostics/{id}`), a **Continue anyway**
button that resubmits the identical request with `confirmDuplicateVin:
true`, and a **Cancel** button that returns to the idle state.

- **`QuickDiagnosticForm.tsx`** — `submitCase(confirmDuplicateVin)`
  extracted so both the initial submit and the "continue anyway" retry
  share one code path; a `duplicate_vin` status branch renders the
  warning in place of the form.
- **`ScanCaseActionBar.tsx`** — `runStage("analyze", confirmDuplicateVin)`
  extended to send the flag as a JSON body only for the `analyze` stage
  (the `extract` stage never needs it); a `duplicateWarning` state
  renders the same warning panel in place of the action button.

Neither component needed changes to their happy-path behavior — the
duplicate-warning branch is additive.

## Tests

`test/duplicate-vin.test.ts` — unit tests against the same in-memory
Supabase fake used by `test/scan-analyze-route.test.ts`
(`test/mocks/fake-supabase.ts`), covering `findExistingCasesForVin` and
`getVinForCase`:

- exact match, case-insensitive/whitespace-tolerant match
- never matches across users, never matches a different VIN
- excludes the case passed as `excludeCaseId` while still finding
  *other* matching cases
- ignores cases with no `scan_extractions` row (draft)
- blank VIN → empty result
- multiple matches sorted newest first
- `getVinForCase` returns the VIN, or `null` when absent/never captured

No route-handler-level test exists for the two Next.js routes
themselves — this repo's own convention (see
`test/scan-analyze-route.test.ts`, which tests `runScanAnalysis`
directly rather than the `route.ts` HTTP wrapper) is to unit-test the
underlying `src/lib/*` functions, not the route handlers, since those
depend on `next/server` request/response objects that aren't worth
mocking for logic that's already covered at the function level.

## Known limitations (documented, not hidden)

- **Per-request confirmation, not persisted.** Confirming "continue
  anyway" only applies to that one request. If a customer reloads the
  page and retries the analyze route again later, they'll see the
  warning again. This was a deliberate simplicity trade-off — persisting
  an acknowledgement per case would need a new column and migration for
  a low-frequency edge case (retrying analysis after already
  confirming once).
- **VIN-only matching.** Two different cases for the same VIN are
  always flagged, even if they're genuinely unrelated issues (e.g. a
  brake job six months after an engine diagnosis). This is intentional
  — the warning is informational, not a rule engine trying to guess
  relatedness; "continue anyway" exists specifically for this case.
- **No admin/analytics visibility into how often this fires.** No new
  analytics event was added for "duplicate VIN warning shown" or
  "continue anyway clicked" — out of scope for this pass, could be
  added later the same way `src/lib/analytics/events.ts` tracks other
  funnel events.

## Rollback

Every change here is additive: a new lookup function, a new error type
mapped in the existing `toSafeErrorResponse` switch, a new optional
request field on two existing routes, and new UI branches that render
only when the new error code is returned. No migration, no schema
change, no change to `runScanAnalysis`'s own internals. Reverting is a
pure code revert in either direction.
