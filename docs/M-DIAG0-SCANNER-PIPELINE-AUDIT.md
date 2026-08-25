# M-DIAG0 — Scanner-Report Pipeline Audit

**Audited by:** Claude Code (read-only audit; no implementation performed)
**Audit date:** 2026-08-23
**Method:** Every claim below is cited to a repository file/symbol, migration, or test-run output. Six parallel research passes plus direct verification (`tsc --noEmit`, 15 targeted test files / 145 tests). Nothing in this document is inferred from prior sessions, external documents, or assumption.

---

## 1. Executive verdict

**GO WITH CONDITIONS.**

The existing scan-diagnostics pipeline is architecturally sound on the two dimensions that matter most for a diagnostic-integrity product: **evidence preservation** and **tenant isolation**. Complaint text, DTC status, module attribution, and vehicle fields survive the full pipeline verbatim or with an explicit unknown-state, not silently zeroed. Every one of the 14 `scan_*` tables has exactly one RLS policy (owner-scoped SELECT only), zero client-writable policies, and every write path is independently ownership-checked in application code before the service-role client is used — confirmed by direct code inspection (four spot-checked routes, no counter-example found) and by dedicated tests that already prove cross-tenant access is rejected.

The conditions are real, not cosmetic:

1. **Safety-rule coverage has a gap.** Six deterministic safety rules exist; none specifically cover brakes, steering, fuel-system work, or unsafe road-test procedures — categories the product's own non-negotiable principles explicitly require. (§10)
2. **AI is inside the extraction layer for photo uploads**, contradicting the stated M-DIAG2 requirement ("no AI-generated facts inside the extraction layer"), and the resulting provenance distinction is stored but never shown to the technician viewing the report. (§9, §7)
3. **No malware-scanning boundary exists** between upload and storage. (§6)
4. **No OCR path exists** for image-only PDFs (a real, common intake case) — this fails loudly today, which is correct behavior, but it means a meaningful slice of real-world uploads currently cannot be processed at all. (§6)
5. **Production KPI instrumentation is almost entirely absent.** Of the nine baseline metrics M-DIAG5 wants, only "provider cost per case" is currently real and aggregated. Everything else — including the two most important, top-1/top-3 cause accuracy and hallucination rate — has either no field, an un-aggregated field, or no field at all. (§15)

None of these five block M-DIAG1 (a schema migration) on their own, but #1 and #2 should be resolved or explicitly risk-accepted before any external technician relies on the product for real repairs, and #5 means M-DIAG5's scorecard cannot be populated from today's instrumentation without material engineering work first.

---

## 2. Repository and production identity

- **Repository**: `C:\Users\wallyd1\DTC DECODER`, remote `origin` → `https://github.com/odeyt/dtcdecoder-platform.git`. Confirmed the correct repository (matches `package.json` `"name": "dtcdecoder"`, `CLAUDE.md`'s description, and `dtcdecoder.com` production references throughout the codebase).
- **Production reference commit**: `origin/main` HEAD = `a7c39a4a56c9771612294e771922b081eb0fbc2a` ("fix: correct 'free includes' copy after the cause-redaction change", 2026-08-23) — this is the deployed production state, verified via `git rev-parse origin/main` and cross-checked against a live production deploy verification earlier in this working session (Vercel deployment inspection + a direct HTTP check against `dtcdecoder.com`).
- **Local checkout state at time of audit — important caveat**: this checkout is **actively shared with a second, concurrently-running Claude Code session**. That session is working on an unrelated initiative ("M-GROWTH1A" — a verified-repair consent/growth-referral feature, branch `growth/m-growth1a-repair-governance`, 10 commits, HEAD `aa8f989`) and is the currently-checked-out branch in this shared working directory. Separately, **this session's own prior work** (Laos PDR BCEL payment routing, and a security-definer RPC privilege-hardening migration, both already committed to their own branches and pushed to `origin`) has left 36 uncommitted working-tree files layered on top of whatever branch happens to be checked out. **None of this uncommitted or peer-branch work touches any file in the scan-diagnostics pipeline** (`src/lib/scan-diagnostics/**`, `src/components/ScanReportView.tsx`, `src/app/api/scan-diagnostics/**`, or any `scan_*` migration) — verified by diffing the changed-file list against every file path cited in this document. The audit below reflects the scan-diagnostics pipeline as it exists at `origin/main`'s `a7c39a4`, which is identical to what's in this working tree for every file this audit examines.
- **Framework/runtime inventory** (`package.json`): Next.js `16.2.10`, React `19.2.4`, TypeScript `^5`, `@supabase/supabase-js ^2.110.5` + `@supabase/ssr ^0.12.2`, `openai ^6.49.0` (the sole AI provider — no `@anthropic-ai/sdk` dependency exists), `next-intl ^4.13.3`, `zod ^4.4.3`, `unpdf ^1.6.2` (PDF text extraction), `papaparse ^5.5.4` (CSV), `fast-xml-parser ^5.10.1` (XML), `sharp ^0.35.3` + `heic-convert ^2.1.0` (image processing), `@capacitor/*` (Android packaging), `firebase-admin ^14.2.0` (push notifications). **No PDF-generation library, no OCR library, no error-tracking/APM library** (Sentry, Bugsnag, Datadog, etc. — confirmed absent via case-insensitive grep across `package.json` and `src/`).
- **Payment provider**: Creem.io, one-time and recurring subscription checkout (confirmed in this same working session's independent audit; unrelated to scan-diagnostics).
- **Deployment**: Vercel, `main` branch auto-deploys to production; single shared Supabase project for Preview and Production (no separate staging database).

---

## 3. Architecture map

```
Browser (ScanCaseUploadForm.tsx / QuickDiagnosticForm.tsx)
  → POST /api/scan-diagnostics/cases              (create case row)
  → POST /api/scan-diagnostics/cases/[id]/upload   (file-validation.ts → storage.ts → scan_case_files)
  → POST /api/scan-diagnostics/cases/[id]/extract  (registry.ts dispatch → one of 6 deterministic parsers,
                                                      OR ai/vision-extraction.ts for photos → scan_extractions,
                                                      scan_dtc_records, scan_systems)
  → POST /api/scan-diagnostics/cases/[id]/analyze  (canonical-input.ts → shared-prompt.ts →
                                                      ai/openai-provider.ts → safety-rules.ts → confidence.ts →
                                                      report.ts → scan_ai_runs + scan_reports)
  → GET  /diagnostics/[caseId]                     (report-access.ts → redaction.ts → ScanReportView.tsx)
  → print / CopyReportButton                       (browser print; report-copy-format.ts)
```

Deterministic layers (parsers, canonical-input, safety-rules, confidence bucketing) are pure/synchronous functions of persisted data. The only two AI provider calls in the entire pipeline are (a) `openai-provider.ts`'s diagnosis call and (b) `ai/vision-extraction.ts`'s photo-to-structured-data call — the latter is architecturally an *extraction* step, not a *diagnosis* step, which is the source of Finding #2 in §1.

---

## 4. End-to-end pipeline trace

### 4.1 Upload → validation → storage

- **UI**: `src/components/ScanCaseUploadForm.tsx`. Accepts `.pdf,.txt,.csv,.json,.xml,.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif`; client-side `MAX_SIZE_MB = 15`, `MAX_IMAGE_COUNT = 10` (lines 7–10). Enforces "one document OR up to 10 photos" per case (lines 52–64). Case created via `POST /api/scan-diagnostics/cases`, then each file via `POST .../upload` — photos uploaded sequentially, never in parallel, because "the server derives each photo's position from how many rows already exist" (comment, lines 158–160).
- **API route**: `src/app/api/scan-diagnostics/cases/[caseId]/upload/route.ts`. Requires an authenticated session (401 otherwise, lines 30–36); calls `getCaseForOwner(user.id, caseId)` (line 39) — ownership-checked before any storage access. File buffered fully into memory, then `validateScanFile` (line 54) runs **before** the file ever touches storage.
- **Validation**: `src/lib/scan-diagnostics/file-validation.ts`. Extension allowlist/denylist (`BLOCKED_EXTENSIONS` covers `exe, msi, bat, cmd, sh, ps1, js, jar, apk, dmg, dll, zip, rar, docm, vbs, scr,` etc., lines 18–22), magic-byte signature sniffing (`sniffSignature`, lines 51–109) cross-checked against a `COMPATIBLE_SIGNATURES` allowlist (120–135), and a `sharp(buffer).metadata()` decode check that catches corrupt jpg/png/webp/gif (217–232). **HEIC/HEIF are explicitly not decode-checked at validation time** — a corrupt HEIC passes validation and only fails later during extraction (comment, line 174).
- **Storage**: bucket `diagnostic-scan-files` (`env.ts:114-115`, `SUPABASE_STORAGE_BUCKET_SCAN_FILES` overridable), created **private** (`supabase/migrations/0014_scan_diagnostics_storage.sql:8`, `public: false`), with **no `storage.objects` RLS policy granted to `anon`/`authenticated`** for this bucket at all (confirmed by repo-wide grep — the only storage RLS policy elsewhere belongs to a different, public-preview bucket). Files are written to a randomized path `${userId}/${caseId}/${crypto.randomUUID()}` — the original filename is never used as or embedded in the storage key (`storage.ts:18-27`). Served back only via a 5-minute signed URL (`SIGNED_URL_TTL_SECONDS = 60*5`, `storage.ts:11,40-48`), generated only after the download route's own ownership check (`files/[fileId]/route.ts`).
- **Malware-scanning boundary**: **not found.** Searched `storage.ts`, `file-validation.ts`, and repo-wide for `malware|antivirus|clamav|virus scan` — zero code hits (the only match anywhere is prose on the Acceptable Use legal page). The only content-integrity control between upload and storage is `validateScanFile`'s type/signature check; there is no scanning step.
- **Failure behavior**: unsupported/blocked file type → rejected before storage, HTTP 400 with a specific reason (`file-validation.ts:175-236`, `upload/route.ts:54-57`). Corrupt jpg/png/webp/gif → caught at validation. Corrupt HEIC/HEIF and password-protected PDFs → **not caught at validation**; degrade to a generic extraction-layer failure/fallback later (§4.2), not a distinct "this file is protected/corrupt" message.

### 4.2 Extraction / OCR / format recognition / structured parsing

- **Dispatcher**: `src/lib/scan-diagnostics/parsers/registry.ts`. `selectParser(buffer, declaredFormat, filename)` (24–30) picks the first parser whose `.detect()` matches — and **every parser's `.detect()` is a one-line check against `declaredFormat`** (e.g. `pdf-parser.ts:42-44`), itself computed upstream from file extension + magic-byte sniffing. **No content-sniffing or scanner-brand-header detection exists at the dispatch layer, and no scanner-brand-specific parser exists at all** — six generic format parsers (`txt, csv, json, xml, html, pdf`) handle every text-based upload. `runExtraction()` never hard-fails on a parser exception: an unmatched format or a thrown parser error both fall through to `generic-fallback` (raw-text regex scan) with a warning appended (lines 40–64), confirmed by `test/scan-parser-registry.test.ts`.
- **Determinism**: all six parsers (plus their shared helpers `plain-text-extraction.ts`, `dtc-extraction.ts`, `system-sections.ts`) are pure regex/library-based text processing — `unpdf` for PDF text-layer, `papaparse` for CSV, native `JSON.parse`, `fast-xml-parser` (with an explicit DOCTYPE-stripping step for billion-laughs defense, `xml-parser.ts:8-12`), a hand-rolled HTML tag-stripper. **No AI-provider call exists anywhere in this call chain.**
- **The one exception**: `src/lib/scan-diagnostics/ai/vision-extraction.ts` — used exclusively for photo/screenshot uploads (`extract/route.ts`, gated behind `isPhotoUpload` and the `canAccessFullDiagnostics` entitlement). It calls **OpenAI**'s `chat.completions.parse` with a structured-output schema to produce `ParsedScanReport` directly from image bytes. The file's own header comment (lines 1–7) is explicit: *"the ONE place in this codebase's scan-diagnostics pipeline where a raw uploaded file is sent to an AI provider... every text-format parser only ever works on locally parsed bytes."* This is AI **inside** extraction, not downstream of it — see §1 Finding #2 and §9.
- **Stale documentation found**: `src/lib/scan-diagnostics/image-processing.ts` (used to normalize photos before the vision-extraction call) repeatedly documents its destination as *"Claude's vision API,"* citing `docs.anthropic.com` (lines 1, 7, 13, 35–38). The actual call in `vision-extraction.ts` is to OpenAI (`import OpenAI from "openai"`, `client.chat.completions.parse`), confirmed also by `model-routing.ts:56` routing `scanImageExtraction` to `OPENAI_STRONG_MODEL`. This is a documentation-accuracy defect (code comments describing the wrong provider), not a functional bug — flagged as a ranked defect in §16.
- **OCR for image-only PDFs**: **does not exist.** `pdf-parser.ts` detects a scanned/image-only PDF via an average-characters-per-page threshold (`avgCharsPerPage < 20`, lines 5–9, 58–60) and returns an explicit, user-visible warning: *"This PDF appears to be scanned images with no extractable text. OCR is not yet supported — please enter the vehicle info and DTCs manually below."* The extension point is deliberately unimplemented: `src/lib/scan-diagnostics/ocr/types.ts` (11 lines) declares an unused `OcrProvider` interface with a comment stating *"Do not wire a fake/no-op implementation of this; the absence of a registered provider IS the current, correct behavior."* This is honest failure, not silent failure — but it means a scanned/photographed PDF (a plausible real-world upload, distinct from a native "take a photo of the scanner screen" flow which IS supported via vision-extraction) currently cannot be processed as a document upload at all.
- **Scanner-brand support claims**: none exist as parsing logic. `plain-text-extraction.ts`'s `SCANNER_BRAND_KEYWORDS` (lines 94–104: LAUNCH, Autel, Snap-on, Bosch, Innova, OBDLink, Foxwell, Topdon, ANCEL, Matco, OTC, Actron, BlueDriver, Carly) is explicitly *display-metadata-only, best-effort, "deliberately non-exhaustive and never fabricates a brand"* (comment, 90–93) — it never selects a different parsing routine. The regex heuristics in `dtc-extraction.ts`/`system-sections.ts` were shaped by real LAUNCH X431-format reports (confirmed by a sanitized real-world fixture, `test/fixtures/zotye-scan-report.ts`, exercised by `test/scan-zotye-regression.test.ts`) but remain generic, not brand-gated.

### 4.3 VIN/vehicle resolution → DTC normalization → complaint/symptom propagation

- **Vehicle fields**: `persistExtraction()` (`extraction.ts:67-71`) stores `vin/make/model/model_year/engine` as `parsed.X ?? null` — absent fields become `null`, never `""` or `0`. `canonical-input.ts` (63–72) and `canonical-scan.ts` (190–196) both preserve this through a `reviewedOr(...) ?? extraction?.field ?? null` chain — numeric fields (`year`, `mileage`) never default to `0`.
- **DTC status normalization**: `normalizeStoredDtcStatus()` (`extraction.ts:27-38`) distinguishes **`null`** (no status text present) from **`"unknown"`** (status text was present but unrecognized) — all eight `ScanDtcStatus` enum members (`current, history, pending, permanent, intermittent, stored, reference_only, unknown`) are distinct, regex-matched values with no collapsing.
- **Permanent/intermittent priority bucketing — confirmed currently fixed**: `priority.ts` (26–56) treats `permanent` identically to `current` (both promotable to `fixFirst` on safety/bus-off relevance, else `diagnoseNext`) and `intermittent` identically to `history` (both → `monitorRecheck`), with an explicit code comment (28–35) stating a permanent DTC "is not a lesser or more historical class of fault than current." Only `reference_only`, `unknown`, `pending`, `stored`, and null-status land in the lowest-priority `historicalReference` bucket. The raw per-DTC `status` value is never mutated by this bucketing — it survives independently in the prompt and in every persisted record.
- **Module attribution**: `ScanDtcRecord.module` and `.system_name` are separate DB columns (`types.ts:528,535`); `canonical-input.ts` (80–91) coalesces `module ?? system_name` for the AI-facing shape (documented: the text/PDF parser only ever populates `system_name`), while `canonical-scan.ts`'s `CanonicalDtc` keeps both raw fields available separately.
- **Duplicate DTC handling**: keyed identically at both the in-memory parser level (`dtc-extraction.ts`'s `dedupeDtcCodes`, key = `module|systemName|code|status`) and the DB-insert level (`extraction.ts`'s `dtcKey()`, same composite key). Because module and status are part of the key, **two genuinely distinct findings (same code, different module or different status) are never incorrectly merged** — confirmed by an explicit code comment citing a real case (a code appearing under both "Electric Power Steering" and "A/C System") and by `test/scan-status-normalization.test.ts` (line 30: "same code/status but different systems kept distinct"). True duplicates (identical module+system+code+status) only backfill a missing description, never overwrite other fields.
- **Complaint/symptom propagation**: traced verbatim through every hop — `ScanCaseUploadForm.tsx`/`QuickDiagnosticForm.tsx` capture (raw text, comma/newline-split for symptoms only) → `cases.ts` (`complaint: info.complaint ?? null`, no transform) → `canonical-input.ts` (`complaint: scanCase.complaint`, verbatim) → `shared-prompt.ts`'s `buildUserPrompt` (`input.complaint ?? "not provided"`, verbatim). **No summarization, truncation, or silent-drop point exists anywhere in this chain.**
- **Unknown-state semantics**: `DtcCategoryClassification` has a genuine three-way state (`found | none_reported | not_stated`, `schemas.ts:234`) used correctly (`category-classification.ts` only ever emits `found`/`not_stated` today; `none_reported` is reserved for a future parser). Two minor gaps found: `CanonicalDtc.status` declares an `"unknown_from_source"` type member (`canonical-scan.ts:42`) that is **never actually assigned anywhere** in the traced code (dead type state); and `ScanExtractionQuality.confidence` (`canonical-scan.ts:86`) **silently defaults to `"medium"`** when absent (`canonical-scan.ts:211`) rather than exposing an explicit unknown state.

### 4.4 Model-input construction → provider call → response parsing → persistence

- **Prompt construction**: `shared-prompt.ts`'s `buildUserPrompt` (98–217) assembles VEHICLE / CUSTOMER COMPLAINT-SYMPTOMS / SYSTEM-MODULE SUMMARY / DETECTED PATTERNS (explicitly labeled "deterministic... treat as evidence, not a conclusion to repeat verbatim") / DETERMINISTIC PRIORITY GROUPING / EXTRACTION QUALITY / MODULES / DTCs (code+module+status+description+curated-reference-meaning per code) / DTC CATEGORY CLASSIFICATION / FREEZE FRAME / LIVE DATA / EXTRACTION WARNINGS, in that order.
- **Truncation, disclosed not silent**: `canonical-input.ts:25`, `MAX_FULL_DTC_LISTING = 150`. Above that count, current/safety/network/battery/bus-off-relevant DTCs are always kept in full; the omitted remainder is recorded as `{count, codes}` and explicitly rendered in the prompt (161–165) as a visible notice — the canonical DB record itself is never trimmed, only this one prompt listing.
- **Provider call**: `openai-provider.ts` uses `client.chat.completions.parse` with `zodResponseFormat(DiagnosticAiOutputSchema, ...)` — OpenAI structured-output chat completions. Two-layer retry: a transient-error (5xx/408/429/network) retry once against a configured fallback model (`runWithFallback`), and a validation-failure (bad schema/truncation/refusal) retry of the whole sequence once more (`runWithValidationRetry`). `finish_reason === "length"` and a missing/refused parsed result both throw `AiResponseValidationError` rather than returning a degraded result.
- **Provider failure cannot produce a misleading success — confirmed.** `analyze.ts`'s try/catch (206–281) around `provider.runDiagnosis` releases the usage reservation, inserts a `scan_ai_runs` row with `status: "failed"`, transitions the case `"analyzing" → "failed"` (never to `"completed"`), and throws `ScanAnalysisFailedError` up to the route. The only path to `scan_reports`/`"completed"` is the success path after `assembleAndPersistReport`. Directly proven by `test/scan-analyze-route.test.ts` ("provider failure: case ends up failed, and a retry does not double-charge usage"; "malformed AI output handled safely, no crash").
- **Persistence — raw vs. reviewed separated**: `scan_ai_runs.output` stores the **raw, unredacted** AI response plus `safety_review` and `prompt_version` (currently `"2026-08-complaint-evidence-v3"`, stored per run for replay/audit). `scan_reports` stores only the `redactBlockedContent`-processed final output. These are genuinely two separate persisted artifacts, confirmed by direct code read of `analyze.ts` and `report.ts`.
- **Vision-extraction provenance is stored but not customer-visible**: `extract/route.ts` sets `scan_extractions.parser_id = "vision-extraction"` (vs. a deterministic parser's own id) when the photo path runs, and `image_evidence` records per-image transcription warnings. A repo-wide grep of `src/components` found these fields referenced **only** in `src/app/(app)/admin/scan-inspection/page.tsx` — an internal admin page. **No customer/technician-facing surface indicates that a given VIN or DTC was read by an AI model from a photo rather than extracted deterministically from a text-format document.** This is the concrete instance of §1 Finding #2.

### 4.5 Customer rendering → export/print

- **Rendering**: `ScanReportView.tsx` renders every field of the (already access-level-filtered) `ScanReportVisibleResult` — no field is silently dropped from the JSX. The specific "Current: 0, History: 0 implying no faults" failure mode is structurally prevented: `redaction.ts` defines separate `permanentCount`/`intermittentCount` tiles specifically because, per its own comment, "a report with real active/confirmed faults that simply aren't literally statused 'current' or 'history' would show Current: 0, History: 0 ... implying no faults exist." Category badges have three explicit states (`found` / `none_reported` / a `notStatedLabel` fallback) — "unknown" never collapses into "0" in the UI.
- **Redaction is genuinely server-side**: `filterScanReportForAccessLevel` (`redaction.ts`) is called only from `report-access.ts` (`import "server-only"`), itself called only from the Server Component `diagnostics/[caseId]/page.tsx` and one API route. `ScanReportView` is itself a Server Component receiving only the already-redacted prop. Locked fields for preview-tier viewers are structurally absent (never spread onto the returned object), not merely hidden by the client.
- **Export/print**: no PDF-generation library exists in this codebase. Printing is `window.print()` on the live DOM (`ScanPrintButton.tsx`) with `print:hidden`/`print:gap-6` Tailwind classes hiding interactive chrome — the printed output is the same facts as the on-screen view, no separate lossy regeneration path. The text-copy export (`report-copy-format.ts`'s `formatReportForCopy`) is **intentionally narrower**: it includes vehicle/DTCs/likely-causes/recommended-tests/safety-warnings but explicitly omits scanner metadata, module-health table, patterns, health-summary counts, evidence panel, complaint/symptoms, and technician notes — a real, by-design content reduction versus the full view, worth noting as a minor evidence-completeness gap in that one specific export path.

### 4.6 Localization

- **Structural protection, not just prompt instruction**: `report-localization.ts` translates only `rankedCauses`, `recommendedTests`, `missingInformation`, `extractionWarnings`. Fields like `vehicleSummary`, `dtcs` (codes/modules/status), `scannerMeta`, `healthSummary`, and `safety.findings` are never routed through translation at all — they come straight from the deterministic, extraction-derived `base` object. DTC codes and module identifiers therefore **cannot** be altered by translation, by construction, not merely by instruction.
- Within the text that IS translated, the system prompt explicitly instructs the model to preserve "DTC codes (e.g. P0420), VINs, part numbers, connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages, resistance/pressure/torque/temperature values and their units, module acronyms... calibration IDs, and TSB numbers exactly as written... never translate or alter them," plus a hard structural constraint (same array length/order) and a glossary of `do_not_translate` terms.
- **Safety-warning text is never translated** — it stays English-sourced regardless of the report's locale (`safety.findings` is part of the untouched `base`, not `ScanReportTranslatable`). This is deliberate (never risk mistranslating a safety warning) but is a real consideration for the product's own stated Lao/Thai localization goals (M-DIAG11): a non-English-fluent technician's safety warnings render in English today.
- **Fallback is honest, never silently broken**: every non-success translation path (`localized-report.ts`) returns full canonical English content with an explicit `fallbackUsed: true` flag, surfaced visibly in `ScanReportView.tsx` ("translatedFallback" vs. "translatedSuccess" copy) — never a mixed/partial/broken-looking translation.
- **12 live/built locales** (`en, es, fr, th, lo, vi, km, zh-CN, pt-BR, de, ja, ko`) out of 53 recognized locale codes; the other 41 are routing-only (redirected to English), never eligible for translated content.

---

## 5. Current data model

Full `scan_*` table inventory (14 tables, all migrations cited):

| Table | Migration(s) | Purpose |
|---|---|---|
| `scan_cases` | 0012, +0026, +0038, +0042 | Case identity, status machine, complaint/symptoms, technician sign-off |
| `scan_case_files` | 0012, +0046 | Uploaded file metadata, SHA-256, upload order |
| `scan_extractions` | 0012, +0025 (nullable file_id), +0028 (scanner meta + quality), +0046 (image_evidence) | Parsed vehicle/scanner fields |
| `scan_dtc_records` | 0012, +0028 (system_name/relevance flags), +0046 (source_image_index) | Individual DTC rows |
| `scan_ai_runs` | 0013, +0015 (prompt_version) | Raw AI call log (one row per attempt, success or failure) |
| `scan_reports` | 0013, +0015 (schema_version, confidence_level) | Safety-redacted final report (one live row per case, upserted) |
| `scan_feedback` | 0013 | Technician-submitted outcome (diagnosis_was_correct, actual_root_cause, confirmed_fix, parts_replaced) |
| `scan_usage` | 0013 | Monthly scan-analysis usage ledger (legacy — see §14) |
| `scan_report_localizations` | 0021 | Per-locale translated report cache |
| `scan_systems` | 0028 | Per-module extraction completeness |
| `scan_patterns` | 0028 | Deterministic cross-DTC pattern findings |
| `scan_case_notes` | 0042 | Technician notes |
| `scan_report_test_progress` | 0042 | Pass/fail/not-tested per recommended test |
| `scan_report_cause_status` | 0042 | Untested/supported/ruled-out/confirmed per ranked cause |
| `scan_case_verification` | 0042 | Post-repair verification checklist (8 booleans) |

Full column lists are in the underlying research; omitted here for length but available on request.

---

## 6. Parser and scanner coverage

Six deterministic format parsers (`txt, csv, json, xml, html, pdf`) plus one AI-based photo path (`vision-extraction`). No scanner-brand-specific parser exists. Dispatch is format-hint-driven only (extension + magic-byte signature), never content-sniffed for a specific scanner brand. See §4.2 for full detail, including the confirmed absence of OCR and malware scanning, and the weak (fallback-only) handling of password-protected/corrupt-HEIC files.

---

## 7. Evidence preservation/loss register

**Preserved correctly** (confirmed by code + passing tests): complaint/symptom text (verbatim), VIN/vehicle fields (null-preserved, never zeroed), DTC status (8 distinct values, null-vs-unknown distinguished), module attribution, duplicate-vs-distinct DTC handling, permanent/intermittent priority treatment, raw-vs-safety-reviewed AI output (separately persisted), confidence (qualitative-only, no fabricated precision), deterministic replayability of the canonical AI input.

**Lost or at risk**:
- Vision-extraction provenance (AI-derived vs. deterministically-parsed fact) is captured in the database but not shown anywhere a customer or technician can see it (§4.4).
- The text-copy export omits several sections present on-screen (§4.5) — by design, but a real reduction in that one path.
- `ScanExtractionQuality.confidence` silently defaults to `"medium"` rather than exposing an explicit unknown state (§4.3).
- A corrupt HEIC/HEIF or password-protected PDF does not get a distinct, clearly-labeled failure — it degrades into the generic parser-failure fallback path (§4.1–4.2).
- Safety-warning text never translates, so a non-English report's safety section stays English (§4.6) — deliberate, but a real gap against the localization goal.

---

## 8. Unknown-state semantics

Genuine tri-state (or richer) modeling exists in two places: `ScanDtcStatus` (`null` = no status text vs. `"unknown"` = unrecognized status text) and `DtcCategoryClassification` (`found | none_reported | not_stated`). Elsewhere (case-level fields: complaint, mileage, recent_repairs, battery_condition, technician_notes), "don't know" collapses to plain `null` with no richer state — acceptable for free-text fields, but M-DIAG1's proposed "known absent/zero vs. unknown/not-stated vs. unreadable vs. conflicting" taxonomy does not exist as a general mechanism today. This is the primary concrete gap M-DIAG1's universal schema needs to close (see §17).

---

## 9. Diagnostic reasoning and provider boundary

OpenAI (`chat.completions.parse`, structured output via Zod schema) is the sole diagnosis provider — no Anthropic SDK dependency exists. Two-layer retry (transient-error fallback-model retry, then one validation-failure retry) before a hard, clearly-surfaced failure. The one boundary violation: `vision-extraction.ts` puts an OpenAI call **inside** the extraction layer for photo uploads, which the M-DIAG2 principle "no AI-generated facts inside the extraction layer" would prohibit as currently architected — this is a real design tension the M-DIAG1/M-DIAG2 planning needs to resolve explicitly (either accept AI-assisted extraction as a distinct, provenance-labeled category, or route photos through a genuine OCR step instead).

---

## 10. Safety review

Six deterministic post-hoc safety rules (`safety-rules.ts`), applied **after** the AI's reasoning, never relying on prompt compliance alone:

| Rule | Severity | Covers |
|---|---|---|
| `high-cost-module-replacement-no-tests` | block | ECU/PCM/ECM/BCM/TCM/BECM/inverter/ABS/steering-rack replacement recommended with zero tests |
| `high-cost-module-replacement-untested` | warn | high-cost replacement suggested but no test mentions that module |
| `ev-high-voltage-missing-ppe-warning` | block | HV battery/traction-battery/orange-cable work without a PPE/lockout-tagout phrase |
| `airbag-squib-circuit-probing` | block | squib/airbag circuit + probing tool language |
| `immobilizer-security-bypass` | block | non-negated "bypass the immobilizer/security system" (negation-aware) |
| `comm-fault-module-replacement-without-power-ground-network-tests` | warn | module replacement in a network-fault context without power/ground/network tests |

**Not covered by any dedicated rule**: brakes, steering (beyond generic "steering rack" being treated as just another costly part), fuel system, or unsafe road-test procedures. This is the single highest-priority safety finding in this audit — the product's own stated non-negotiable principles list "brakes, steering... unsafe road tests" explicitly, and no deterministic guardrail currently exists for any of them.

Prompt-injection defenses are explicit and present at both AI call sites (main diagnosis prompt and vision-extraction prompt), instructing the model to treat all document/image text as data, never instructions.

---

## 11. Security, RLS and tenant isolation

Strong, by direct code inspection and existing tests. All 14 `scan_*` tables: RLS enabled, exactly one policy each (`auth.uid() = user_id`, SELECT only, either directly or via an EXISTS join back to `scan_cases`), **zero INSERT/UPDATE/DELETE policies anywhere**. Every write goes through the service-role client (`createAdminClient()`), and every route checked (`getCaseForOwner`, the analyze route, the notes route, the upload route — four independent spot-checks) performs its own ownership comparison before touching the admin client; no counter-example found. The private storage bucket has no client-facing `storage.objects` policy at all; downloads only ever happen via a short-lived signed URL issued after the same ownership check. `test/diagnostic-engine-security.test.ts` and `test/scan-workbench.test.ts` directly prove cross-user access returns 404 (not 403 — a case owned by someone else is indistinguishable from a nonexistent one). Canonical AI input reconstruction is a pure function of persisted rows only (`canonical-input.ts`), confirming deterministic replay is genuinely possible.

One minor gap: `scan_case_files.file_sha256` is computed and stored at upload time but **never read or compared anywhere** — no duplicate-upload detection exists despite the data being available to build one.

---

## 12. Localization review

See §4.6. Structurally sound: technical tokens are protected by never routing structural fields through translation at all, plus explicit preserve-verbatim prompt instructions and a glossary for the prose fields that are translated. Fallback behavior is honest and visible. The one real product-relevant gap is safety-warning text never being translated, worth an explicit decision given the roadmap's Lao/Thai localization goals.

---

## 13. Tests and behavioral proofs

All 12 required behavioral proofs from the audit brief were checked against existing code and tests, then spot-verified live (15 test files, 145 tests, run during this audit — all passing):

| # | Claim | Result |
|---|---|---|
| 1 | Complaint survives to model input | **Proven** — traced verbatim, `test/scan-canonical-input.test.ts` |
| 2 | VIN/vehicle fields preserve unknown state | **Proven** — `test/scan-canonical-input.test.ts` |
| 3 | DTC code/module/description/status survive independently | **Proven** — `test/scan-dtc-normalization.test.ts`, `test/scan-status-normalization.test.ts` |
| 4 | Duplicate codes from different modules/statuses not collapsed | **Proven** — `test/scan-status-normalization.test.ts` |
| 5 | Permanent/intermittent/current/history not genericized | **Proven** — `test/scan-zotye-regression.test.ts`, `priority.ts` code review |
| 6 | Missing info not shown as zero | **Proven** — `test/scan-legacy-schema-compat.test.ts`, `redaction.ts` design |
| 7 | Multi-module relationships reach reasoning layer | **Proven** — module field present in prompt's SYSTEM/MODULE SUMMARY and per-DTC lines |
| 8 | Image-only/malformed report fails honestly | **Proven for image-only-PDF** (loud warning); **weaker for password-protected/corrupt-HEIC** (generic fallback, not a distinct message) |
| 9 | Provider timeout/failure cannot produce misleading success | **Proven** — `test/scan-analyze-route.test.ts` explicit test |
| 10 | Saved case can be reconstructed/replayed | **Proven by code structure** (pure function of persisted rows); **no dedicated replay test exists** |
| 11 | Tenant A cannot access Tenant B's cases/files | **Proven** — `test/diagnostic-engine-security.test.ts`, `test/scan-workbench.test.ts`, RLS structure |
| 12 | Locale changes don't translate DTC codes/units/numeric values | **Proven** — structural exclusion from translation, not just instruction |

Roughly 45 scan-diagnostics-named files exist under `test/`; e2e coverage is limited to one Playwright spec (`tests/e2e/smoke/workbench-redesign.spec.ts`) — a visual-regression/rendering check against a fixture case, not an upload-flow or full-journey test, and it's skipped entirely when Supabase admin credentials aren't configured for the CI environment.

---

## 14. Observability, usage and costs

Cost tracking is real: pre-flight cost estimate with a hard ceiling enforced **before** the AI provider is ever called (`guardCostCeiling`, `COST_GUARDS.hardCeilingUsd = 1.5` USD), post-hoc actual-cost computation, both logged per call to `ai_diagnostic_runs` (model id, provider id, tokens, latency, status, cost). This is the one metric already aggregated in production (`admin-profitability.ts`). Caveat: `MODEL_PRICING` is empty in code — cost figures come from env-override or a deliberately-pessimistic fallback rate, not confirmed provider billing.

No external error-tracking/APM service is configured — error handling is `console.error`/`console.warn` only, not shipped anywhere durable. 13 scan-diagnostics analytics events exist in `src/lib/analytics/events.ts` (view/section-open/filter/test-check/save/copy/print/complete, etc.) but **nothing in the codebase currently reads or aggregates them** — confirmed by a repo-wide grep finding no query against the underlying `analytics_events` table outside the writer itself.

---

## 15. Baseline KPI availability

| Metric | Available today? |
|---|---|
| Extraction field accuracy | **NO** — no ground-truth table; only unit-test fixtures |
| DTC preservation rate | **NO** as an aggregate — logic is unit-tested, not counted in production |
| Top-1/top-3 cause accuracy | **PARTIAL** — `scan_feedback.diagnosis_was_correct`/`.actual_root_cause` exist, self-reported and opt-in, never aggregated by any code |
| Diagnostic completion rate | **NO** — the relevant analytics events are written, never read |
| First-time-fix rate | **NO** — `scan_feedback.confirmed_fix`/`.parts_replaced` exist, never aggregated, no comeback-linkage |
| Median diagnostic time / time saved | **NO** — no timing fields captured anywhere in the trace |
| Hallucination rate | **NO** — no field flags a hallucinated claim; the closest signal (`sanitizeMissingInformation`'s removed-claims) is a `console.warn` only, never persisted |
| Safety incident rate | **PARTIAL** — `scan_ai_runs.safety_review` is persisted per run and is queryable, but nothing currently aggregates it into a rate |
| Provider cost per case | **YES** — real, already aggregated (`admin-profitability.ts`), though the cost itself is an estimate, not confirmed provider billing |

Eight of nine metrics require new instrumentation, a new aggregation query, or both, before M-DIAG5 can report them from real data.

---

## 16. Ranked defects and risks

1. **[High]** No deterministic safety rule covers brakes, steering, fuel-system work, or unsafe road-test procedures. (§10)
2. **[High]** AI-derived facts (photo/vision extraction) are not distinguishable from deterministically-parsed facts anywhere a technician can see them. (§4.4, §9)
3. **[Medium]** No malware-scanning boundary between upload and storage. (§4.1)
4. **[Medium]** No OCR path for image-only PDFs — a real, currently-unsupported intake case (distinct from the supported photo-upload path). (§4.2)
5. **[Medium]** Near-total absence of production accuracy/hallucination/completion/first-time-fix instrumentation — only cost-per-case is real today. (§15)
6. **[Low]** Stale code comments in `image-processing.ts` describe the vision-extraction call as going to "Claude's vision API" when it actually calls OpenAI. (§4.2)
7. **[Low]** `file_sha256` is computed and stored but never used for duplicate-upload detection. (§11)
8. **[Low]** Password-protected PDFs and corrupt HEIC/HEIF files degrade to a generic fallback/failure rather than a distinct, clearly-labeled error. (§4.1–4.2)
9. **[Low]** `ScanExtractionQuality.confidence` silently defaults to `"medium"` rather than an explicit unknown state; a declared `"unknown_from_source"` type state is never actually used. (§4.3)
10. **[Low]** Safety-warning text is never translated — stays English regardless of report locale. (§4.6)
11. **[Low]** The text-copy export format omits several sections present on-screen. (§4.5)
12. **[Low]** No dedicated automated test proves case reconstruction/replay end-to-end, though the code structure supports it. (§13)

---

## 17. Universal-schema requirements for M-DIAG1

Based on what this audit found actually missing (not the full M-DIAG1 spec, only the gaps this codebase's current state motivates):

- A general "not stated / unreadable / conflicting" tri-state mechanism for case-level fields (complaint, mileage, repair history, etc.), extending the pattern already proven for `ScanDtcStatus` and `DtcCategoryClassification` rather than inventing a new one.
- An explicit, first-class **provenance/source-type field** on every evidence item (deterministic parser vs. AI vision extraction vs. technician-entered vs. technician-corrected) — closing Finding #2 by making the distinction queryable and renderable, not just present in an internal admin view.
- A resolution for the `ScanExtractionQuality.confidence` default-to-`"medium"` gap — either a genuine "unknown" state or a documented, deliberate default.
- Fields to support the M-DIAG5 scorecard from day one (ground-truth outcome linkage beyond today's opt-in `scan_feedback`, timing capture for diagnostic-time/time-saved, a persisted hallucination-flag path) rather than retrofitting them after M-DIAG1 ships.

---

## 18. Migration and rollback constraints

- **No separate staging Supabase project exists** — confirmed in this same working session's independent audit of the payments domain, and consistent with `docs/PHASE_2_PRODUCTION_PREFLIGHT.md`'s recorded owner decision to proceed directly to production. Any M-DIAG1 migration goes straight against the production database; it must be additive-only, reviewed carefully, and applied with an explicit rollback plan, matching this repository's own established migration convention (confirmed via the 0055/0056 migrations from this same working session, which followed exactly this discipline).
- Every existing `scan_*` migration in this codebase is already additive-only (new tables, new nullable columns, widened CHECK constraints) — no destructive migration exists in this domain's history. M-DIAG1 should continue that pattern.
- RLS must be proven for any new table the same way it's proven for the existing 14 (owner-scoped SELECT only, zero client-write policies, all writes through an ownership-checked service-role path) — this audit found the existing convention easy to verify by direct inspection, which is itself evidence the pattern is worth continuing rather than replacing.

---

## 19. Recommended milestone sequence

Proceed to **M-DIAG1** (schema) once Odey has reviewed and made the five decisions listed in §20/owner-decisions. Recommend resolving Findings #1 (safety-rule coverage) and #2 (AI-extraction provenance) at the schema-design stage of M-DIAG1 itself — both are naturally addressed by the provenance field and an expanded safety-rule set, not separate work. Do not begin M-DIAG5 instrumentation work until M-DIAG1's schema is live, since §15's gaps are almost entirely "no field exists yet," not "field exists but isn't queried."

---

## 20. Final verdict

**GO WITH CONDITIONS.**

Proceed to M-DIAG1 only after Odey reviews this document and explicitly decides: (a) whether the safety-rule gap (brakes/steering/fuel/road-tests) must close before or can close during M-DIAG1, (b) whether AI-assisted photo extraction is retained as a labeled, provenance-tracked exception to "no AI in the extraction layer" or replaced with real OCR, (c) whether a malware-scanning boundary is required before wider rollout, (d) which scanner formats get first-class (not just generic-format) parsing first, and (e) that M-DIAG5's KPI plan requires substantial new instrumentation, not just new queries against existing data.

---

## Validation performed during this audit

- `npx tsc --noEmit` — clean, no errors.
- 15 targeted test files covering every behavioral proof cited in §13 — 145/145 tests passing (`scan-canonical-input`, `scan-dtc-normalization`, `scan-status-normalization`, `scan-zotye-regression`, `scan-legacy-schema-compat`, `scan-extraction-persistence`, `scan-analyze-route`, `scan-confidence`, `scan-safety-rules`, `scan-openai-provider-truncation`, `scan-api-errors`, `dtc-redaction`, `diagnostic-engine-security`, `scan-workbench`, `scan-parser-registry`).
- No pre-existing test failures were found or needed separating from audit-created ones — this audit created no code, only this document.
- Full repository-wide `vitest run`/`lint`/`build` were **not** run, given the shared-checkout situation described in §2 (another session actively committing in this same working directory) — running the full suite would not have added confidence beyond the 145 targeted tests already covering every claim in this document, and risked resource contention with the concurrent session.
