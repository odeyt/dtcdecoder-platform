# Diagnostic AI Audit

Audit of the scan-report diagnostic AI workflow, performed against the actual live codebase (not assumptions), prior to the Diagnostic Safety v2 changes. This document is the permanent record of what was found and what was fixed — see `docs/DIAGNOSTIC_SCHEMA_V2.md` and `docs/DIAGNOSTIC_SAFETY_RULES.md` for the resulting design.

## Repository / project identity

| Check | Result |
|---|---|
| Repository | `dtcdecoder`, Next.js 16.2.10, TypeScript, Zod 4.4.3 |
| AI provider | **Only Anthropic Claude** (`@anthropic-ai/sdk`). No OpenAI, no Gemini, anywhere in the repo. |
| Vercel project | `redlined1-s-projects/dtcdecoder` (`prj_NDFAoykbuOjgOoHoRBwHVnb2kyNn`) — confirmed correct, distinct from the `redlined1` and `ai-founder-cloud` sibling projects under the same personal Vercel team |
| Production DB vs. staging | **Preview and Production share the same Supabase project.** No Supabase branching is configured. This predates this audit and isn't something this pass changed — noted here because it affects how any future live-upload testing should be approached (prefer mocked/unit tests over live uploads). |
| Numerical fields tied to billing/entitlements | No — billing/usage gating is entirely the `scan_usage` ledger (case-based slot consumption), independent of `confidence`/`probabilityPercent`. |

## Findings

### 1. AI-invented numerical probability (Primary Objective #1)

`RankedCauseSchema.probabilityPercent: z.number().min(0).max(100)` was a **required** field the model had to fill with a number, both in the Zod schema and in the Claude tool's JSON schema (`SUBMIT_DIAGNOSIS_TOOL`). The system prompt (`DEFAULT_SYSTEM_PROMPT`) explicitly instructed: *"Rank the most likely root causes... each with an estimated probability."*

**Fixed:** `probabilityPercent` removed from both schemas; replaced with `confidenceLevel: "high"|"medium"|"low"|"insufficient_evidence"`. Prompt instruction removed and replaced with an explicit categorical-only instruction, repeated in the non-negotiable safety suffix.

### 2. Misleading numerical confidence percentage (Primary Objective #2)

`ScanReportView.tsx` rendered `{report.confidence}%` as a large bold headline number, and `{cause.probabilityPercent}%` as a per-cause badge. The underlying `computeConfidence()` scoring *is* a validated deterministic calculation with documented evidence inputs (not an AI guess) — but presenting it as a bare percentage still implies a calibrated real-world probability it doesn't have.

**Fixed:** both renderings replaced with categorical badges. The deterministic scoring math is unchanged and still computed (now called `internalScore`), banded into a `confidenceLevel`, and kept in `confidence_breakdown`/the deprecated `confidence` column for audit continuity — never surfaced as the headline value.

### 3. Treating a DTC as proof of failure (Primary Objective #3)

The existing prompt already said "never fabricate a fact not in the provided data," but didn't explicitly state a DTC is evidence, not proof.

**Fixed:** added as the opening instruction of the v2 prompt: *"Treat every DTC as evidence that a module detected a condition. A DTC is not proof that the named component failed."*

### 4. Recommending replacement before testing (Primary Objective #4)

**Already correctly handled** by the pre-existing deterministic `safety-rules.ts` engine (not just prompt text) — blocks a high-cost module replacement (ECU/BCM/TCM/inverter/ABS/steering rack) suggested with zero confirming tests, warns when tests exist but don't reference that module. No change needed here; this pass added a `confirmationTestsRequired` field per ranked cause so the requirement is structurally present per-cause, not just globally.

### 5. Inventing OEM specs/wiring/TSBs/part numbers/labor times (Primary Objective #5)

The prompt's general "never fabricate a fact not present in the data" line covered this in spirit but didn't enumerate categories. No labor-time estimate feature exists in this codebase at all (nothing to fix there — it simply isn't built).

**Fixed:** the v2 prompt explicitly enumerates: wiring colors, connector/pin numbers, OEM specifications, TSBs, part numbers, programming procedures, labor times — all listed as things the model must never invent.

### 6. Empty arrays implying confirmed "none" (Primary Objective #6)

**The most significant gap found.** Parsers return `dtcCodes: []`/`modules: []` when nothing matches, with no distinction between "the report said zero" and "extraction found nothing." The prompt then compounded this, representing an empty DTC list to the model as a flat, confident `"none"`.

**Fixed:** new `classifyDtcCategories()` (pure function) classifies pending/permanent/network/lost-communication/battery-related codes as `found` or `not_stated` from real evidence (DTC record status, U-code prefix, explicit lost-communication or battery/voltage text) — deliberately **never** emits `none_reported`, since no parser here can detect an explicit "no pending codes" statement in report text; claiming that without textual proof would be exactly the kind of unsupported inference this exists to prevent. The user prompt now represents missing DTCs/modules as *"not stated in the report... does not mean [X]"* rather than `"none"`.

### 7. Diagnosing before extraction completes (Primary Objective #7)

**Already correctly handled.** The case status state machine requires `ready_for_analysis` (itself requiring the user to confirm the extraction-review step) before `/analyze` will run — `runScanAnalysis()` rejects any other starting state. No violation found, no change made.

### 8. Contradictions between extraction, diagnosis, and UI (Primary Objective #8)

Found: the UI rendered raw percentages the extraction/diagnosis layers didn't actually produce with real calibration behind them (see #1/#2). Fixed by the same changes.

## Other findings (secondary, addressed in this pass)

- **No timeout on PDF parsing** (`pdf-parser.ts`) — a pathological PDF could hang a request. Fixed with a bounded 20s timeout that falls back to the existing raw-text-scan path on expiry (matching how any other parser failure already degrades).
- **No controlled error object for AI validation failures** — a failed Zod parse of the model's structured output threw a generic `Error`. Fixed with `AiResponseValidationError` (`AI_RESPONSE_VALIDATION_FAILED`, `retryable: true`), surfaced additively alongside the existing `error` string field so no existing frontend code breaks.

## Findings noted but intentionally NOT changed in this pass

- **No per-request rate limiting** on `/upload` or `/analyze` beyond the monthly plan-based usage ledger. Real gap, but building a shared rate-limit store (no Redis/shared-memory mechanism exists in this serverless deployment) is a separate, larger infrastructure decision — documented here rather than half-implemented under time pressure.
- **`none_reported` category status is defined but never emitted.** Intentional: emitting it would require a new parser capability (detecting an explicit "no pending codes" statement in report text) that doesn't exist. The schema accepts the value for a future parser; nothing here fabricates it today.
- Nothing in this repo matches the audit brief's assumptions about OpenAI, OCR, or existing labor-time estimates — there was nothing to change because those features don't exist here.

## Legacy data compatibility

Confirmed no billing/entitlement logic depends on `confidence`/`probabilityPercent`. `scan_reports` rows written before this pass are tagged `schema_version = "1.0"` by the migration's backfill (see `docs/DIAGNOSTIC_MIGRATION_PLAN.md`) and render as "Not established" rather than a fabricated or reinterpreted number — no rows were deleted or destructively migrated.
