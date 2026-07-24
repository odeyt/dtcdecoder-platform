# Diagnostic Schema v2

Describes the schema introduced by Diagnostic Safety v2 (migration `0015_diagnostic_safety_v2.sql`, prompt version `2026-07-safety-v2`), and how it coexists with pre-existing (`schema_version "1.0"`) records.

## Why

See `docs/DIAGNOSTIC_AI_AUDIT.md`. In short: the previous shape required the AI to invent a numerical `probabilityPercent` per cause and rendered a bare numerical `confidence` percentage directly in the UI — both presented as more precise/calibrated than the underlying evidence actually supports.

## `DiagnosticAiOutput` (AI structured-output contract)

```ts
{
  summary: string,
  rankedCauses: [{
    cause: string,
    confidenceLevel: "high" | "medium" | "low" | "insufficient_evidence", // never a number
    rationale: string,
    supportingEvidence: string[],
    contradictingEvidence: string[],
    confirmationTestsRequired: string[], // must be non-empty before any replacement is implied
  }],
  recommendedTests: [{ step: string, purpose: string, expectedResult: string }],
  safetyWarnings: string[],
  missingInformation: string[],
}
```

Every AI response is `safeParse`'d against this schema (`src/lib/scan-diagnostics/schemas.ts`) before use — a failed parse throws `AiResponseValidationError`, never passed through as free text (see `docs/DIAGNOSTIC_SAFETY_RULES.md`).

## `DtcCategoryClassification` (extraction honesty layer)

```ts
{
  pendingCodes: { status: "found" | "none_reported" | "not_stated", codes: string[] },
  permanentCodes: { status: ..., codes: string[] },
  networkFaults: { status: ..., codes: string[] },
  lostCommunicationFaults: { status: ..., codes: string[] },
  batteryRelatedFaults: { status: ..., codes: string[] },
}
```

Computed by `classifyDtcCategories()` (`src/lib/scan-diagnostics/parsers/category-classification.ts`), a pure function over persisted `scan_dtc_records` + `scan_extractions.modules` — not persisted to its own column; recomputed on demand in both `canonical-input.ts` (for the AI prompt) and `ScanReportView.tsx` (for display), so it always reflects the current DTC record set.

**Only `found` and `not_stated` are ever emitted today.** `none_reported` exists in the schema for a future parser that adds real detection of an explicit "no pending codes" statement in report text — nothing in this codebase attempts that yet, so claiming it would itself be an unsupported inference.

## Database changes (migration `0015`, additive only)

| Table | Column | Type | Notes |
|---|---|---|---|
| `scan_reports` | `schema_version` | `text not null` | Backfilled to `'1.0'` for any pre-existing row, defaults to `'2.0'` going forward |
| `scan_reports` | `confidence_level` | `text` (nullable, checked) | `high`/`medium`/`low`/`insufficient_evidence`. Null on legacy rows. |
| `scan_ai_runs` | `prompt_version` | `text` (nullable) | e.g. `"2026-07-safety-v2"` — traces a run back to the exact prompt/tool-schema that produced it |

**No columns dropped, no data deleted, no destructive statements.** The pre-existing `scan_reports.confidence` and `scan_ai_runs.confidence` numeric columns are kept — documented via SQL `COMMENT` as deprecated/debug-only, still populated (with the internal deterministic score) for audit continuity, never read by the UI as the primary value.

## Legacy (`schema_version "1.0"`) compatibility strategy

This is strategy **C** from the four options considered (adapter / nullable fields / dual schema version / backfill) — chosen because it requires no destructive change and no risky adapter layer at the API boundary:

- New AI runs always write `schema_version: "2.0"` and populate `confidence_level`.
- Old rows keep `schema_version: "1.0"`, `confidence_level: null`, and their original numeric `confidence`/`ranked_causes[].probabilityPercent` JSON untouched.
- `src/lib/scan-diagnostics/report-presentation.ts` (`isLegacyReport()`, `resolveConfidenceLabel()`) is the single place this distinction is read. A legacy report renders **"Not established"** for confidence — the old number is never reinterpreted into a band, since that would apply today's (different, tighter) banding logic to data it was never computed under.
- `ScanReportView.tsx`'s local TypeScript interfaces mark `confidenceLevel`/`confirmationTestsRequired` as optional specifically so a legacy `ranked_causes` JSONB blob (which only ever had `probabilityPercent`) renders without crashing — see `test/scan-legacy-schema-compat.test.ts`.

## API response compatibility

`toSafeErrorResponse()` (`src/lib/scan-diagnostics/api-errors.ts`) keeps the existing `error: string` field every current frontend caller reads (`ScanCaseActionBar.tsx` reads `data.error` directly) and additively includes `code`/`retryable` for callers that want the more specific controlled-error shape:

```ts
{ error: string, code?: string, retryable?: boolean }
```

`AiResponseValidationError` → `code: "AI_RESPONSE_VALIDATION_FAILED"`, `retryable: true`, HTTP 502. No provider error detail, prompt content, or stack trace is ever included.
