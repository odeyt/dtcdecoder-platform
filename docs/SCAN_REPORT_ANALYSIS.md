# Scan Report Analysis

Upload a scan-tool report, get a structured, AI-assisted diagnostic analysis. Ships fully built but **feature-flagged off** (`NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED=false`) until the Supabase migrations below are applied to the target project.

## Documentation discrepancy (read this first)

The original build brief for this feature referenced a set of project documents — `CLAUDE_RULES.md`, `PROJECT_VISION.md`, `SYSTEM_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_REFERENCE.md`, `AI_ORCHESTRATOR.md`, `DIAGNOSTIC_ENGINE.md`, `CODING_STANDARDS.md`, `ROADMAP.md`, `FEATURE_REGISTRY.md`, `PRODUCT_REQUIREMENTS_DOCUMENT.md`, `BUSINESS_MODEL.md`, `PROMPTS_LIBRARY.md` — that **do not exist in this repository**. The working codebase (and this document) are the source of truth for the feature as actually built. If those documents get created later, reconcile them against this file rather than the other way around.

The brief also assumed infrastructure that doesn't exist here: a multi-org/shop model, an existing scan-upload feature, a multi-provider AI consensus system (OpenAI + Claude + Gemini), and a background job queue. None of that exists in this codebase. This feature was scoped down accordingly — see "Known limitations" below.

## Supported formats

**Documents:** PDF, TXT, CSV, JSON, XML, HTML. Generic parsing only — no vendor-specific field mapping for Autel/Launch/Topdon/Techstream/GDS2/ISTA/ODIS/FORScan exports (see limitations). A shared DTC-code/VIN regex pass runs across every format, so even an unrecognized layout still gets basic code/VIN extraction via a raw-text fallback (`src/lib/scan-diagnostics/parsers/registry.ts`) rather than failing outright.

**Photos/screenshots:** JPG, PNG, WEBP, GIF, HEIC/HEIF (Android and iPhone photos) — see "Photo/screenshot upload" below. A case is either a document upload or a photo upload, never a mix; the upload route rejects a photo added to a case that already has a document (and vice versa).

## Architecture

Distinct stages, each its own module/route — no monolithic handler:

| Stage | Module |
|---|---|
| File validation | `src/lib/scan-diagnostics/file-validation.ts` |
| Storage | `src/lib/scan-diagnostics/storage.ts` |
| Case/status state machine | `src/lib/scan-diagnostics/cases.ts` |
| Parser registry (documents) | `src/lib/scan-diagnostics/parsers/registry.ts` |
| Image normalization (photos) | `src/lib/scan-diagnostics/image-processing.ts` |
| Vision extraction (photos) | `src/lib/scan-diagnostics/ai/vision-extraction.ts` |
| DTC normalization | `src/lib/scan-diagnostics/parsers/dtc-extraction.ts` |
| Extraction persistence/review | `src/lib/scan-diagnostics/extraction.ts` |
| Usage/entitlement gate | `src/lib/scan-diagnostics/usage.ts`, `entitlements.ts` |
| AI provider adapter | `src/lib/scan-diagnostics/ai/provider.ts`, `anthropic-provider.ts` |
| Safety review | `src/lib/scan-diagnostics/safety-rules.ts` |
| Confidence/consensus | `src/lib/scan-diagnostics/confidence.ts` |
| Orchestration | `src/lib/scan-diagnostics/analyze.ts` |
| Report persistence | `src/lib/scan-diagnostics/report.ts` |
| Feedback | `src/lib/scan-diagnostics/feedback.ts` |

API routes live under `/api/scan-diagnostics/...` — deliberately separate from `/api/ai/assistant` (the existing AI chat feature). UI lives under `/diagnostics`.

## Case status state machine

```
draft -> uploaded -> extracting -> extraction_review -> ready_for_analysis -> analyzing -> completed
                          ^                                        |
                          |________________ failed ________________|
```

Every transition is a guarded `UPDATE ... WHERE status = <expected>` (`transitionCaseStatus()` in `cases.ts`) — a concurrent or duplicate request that finds the case already advanced affects zero rows rather than clobbering a newer state. `failed` is reachable from either `extracting` or `analyzing` and is retryable back into the same stage.

## Database schema

Migrations `0012`–`0014` (additive only — new tables/bucket, no changes to existing tables):

- **`scan_cases`** — one row per upload session; `status` drives the state machine above.
- **`scan_case_files`** — uploaded file metadata (randomized storage path, SHA-256, declared vs. detected format). Never the file bytes themselves. `upload_order` (added in migration `0046`) is non-null for photo uploads only — it's how the extract route reconstructs capture/selection order for a multi-photo case; always null for document uploads.
- **`scan_extractions`** — one row per case (unique on `case_id`, so re-extraction upserts). Parser output plus `reviewed_fields` (user corrections layered on top, never overwriting the original extracted values). `image_evidence` (migration `0046`, `jsonb`, default `[]`) holds one `ExtractedEvidence` entry per input photo for a photo-upload extraction — see below.
- **`scan_dtc_records`** — one row per DTC, tagged `source: extracted | user_added | user_edited` so the review UI can always show provenance. Unique on `(case_id, module, code, status)` (NULLs coalesced). `source_image_index` (migration `0046`) records which photo (0-based, matching upload order) a DTC was read from; null for document-derived DTCs.
- **`scan_ai_runs`** — one row per AI attempt (not upserted — a retry after failure creates a new row, so the failure history is preserved).
- **`scan_reports`** — one row per case (unique on `case_id`; re-analyzing overwrites).
- **`scan_feedback`** — one row per case (unique on `case_id`; resubmitting corrects the earlier entry).
- **`scan_usage`** — superseded (kept, unused) by the shared `ai_diagnostic_usage` ledger introduced by the subscription/entitlement overhaul — see `docs/AI_USAGE_LIMITS.md` and `docs/PRICING_ROLLBACK_PLAN.md`. Usage enforcement and free-tier preview redaction for this feature now live in `src/lib/ai-diagnostics/*`, not in this feature's own `usage.ts` (removed).

Named with a `scan_` prefix specifically to avoid colliding with the pre-existing `diagnostic_reports` / `diagnostic_report_localizations` tables, which store saved AI-**chat** answers and are unrelated to this feature.

RLS: owner-only `SELECT` on every table. No `INSERT`/`UPDATE`/`DELETE` policy anywhere — every write goes through the service-role client after an explicit ownership check in application code, matching the existing `diagnostic_reports` precedent.

**Storage:** private bucket `diagnostic-scan-files`, zero public/authenticated policies. Every read is a `createSignedUrl()` call after an ownership check (`storage.ts`, and the case-detail route/page).

### Applying the migrations

Not automatic. Run `supabase db push` against the target project, or paste `0012_scan_diagnostics_core.sql`, `0013_scan_diagnostics_ai_and_usage.sql`, `0014_scan_diagnostics_storage.sql` (and, for photo upload, `0046_scan_photo_upload.sql`) into the Supabase SQL editor in that order — same as every other migration in this repo.

## Photo/screenshot upload (Claude Vision extraction)

Lets a user upload one or more phone photos or screenshots of a scan-tool screen, VIN plate, or printed report instead of a document export — the case flagged as "I tried uploading Android/iPhone photos and it failed" before this shipped.

**Flow** (image uploads only — document uploads are completely unchanged):

```
Upload (1+ photos, ordered) -> validation (magic bytes + decode + limits)
  -> HEIC/HEIF -> JPEG conversion, EXIF-orientation bake-in, downscale (image-processing.ts)
  -> Claude Vision extraction (vision-extraction.ts) -> ParsedScanReport
  -> existing extraction-review / diagnostic pipeline (unchanged)
```

The raw image bytes are sent to Claude **only** during this one extraction step. Every later stage (review, diagnosis, report) only ever sees the same `ParsedScanReport` shape the document parsers already produce — there is no separate "image diagnosis" code path.

**Why sharp alone isn't enough for HEIC.** sharp's prebuilt binary decodes AVIF under its `heif` format id, not real HEVC-coded HEIC (the format actual iPhones write) — that codec is excluded from prebuilt binaries for licensing reasons. `heic-convert` (a WASM libheif build) is the dependency that actually decodes iPhone HEIC/HEIF photos; sharp handles everything else (jpg/png/webp/gif) natively, including EXIF-orientation correction (`.rotate()`) and downscale-only resizing (`fit: "inside", withoutEnlargement: true`). Nothing is ever written to a temp file — Buffers pass directly between `heic-convert` and sharp and are garbage-collected after the request.

**Validation** (`file-validation.ts`) never trusts the extension or declared MIME type alone: every image is sniffed by its actual magic bytes (JPEG/PNG/WebP/GIF signatures, plus an ISOBMFF `ftyp`-box brand check for HEIC/HEIF that deliberately excludes `avif`/`avis` brands so an AVIF file can't be misidentified as HEIC). jpg/png/webp/gif additionally get a real decode-validity + pixel-dimension check via `sharp().metadata()`; heic/heif skip that specific check (sharp can't decode them) and instead surface a corrupt file as a normal "extraction failed" error when `image-processing.ts` actually attempts the conversion.

**Multiple images per case.** A photo-upload case can hold several images (e.g. one screen per module, or a VIN plate photo plus a separate DTC screen) uploaded and analyzed together as one case. The client (`ScanCaseUploadForm.tsx`) uploads photos one at a time, awaited in sequence — never in parallel — because the upload route derives each photo's `upload_order` from how many rows already exist for the case at insert time; concurrent uploads would race and scramble the order. The extract route fetches all of a case's files ordered by `upload_order`, then `uploaded_at`, before calling `extractFromImages()`.

**Evidence provenance.** Claude is asked for a `sourceImageIndex` on each individual DTC (since DTCs don't map one-per-image). For image-level notes/warnings, the code deliberately does **not** trust Claude's own positional labeling — `perImageNotes` in its response is zipped positionally against the caller's own known `{filename, index}` list after parsing, so a mismatched or reordered model response can't corrupt attribution. The resulting `ExtractedEvidence[]` is stored on `scan_extractions.image_evidence`:

```ts
type ExtractedEvidence = {
  sourceType: "image";
  sourceName: string;   // original filename
  sourceIndex: number;  // 0-based upload order
  extractedText?: string;
  warnings?: string[];
};
```

**Never auto-correcting uncertain reads.** The vision system prompt and the `submit_scan_extraction` tool's field descriptions instruct Claude to replace only the specific unclear character in a DTC with `?` (e.g. `P0?17`) rather than guessing a plausible digit — mirroring this feature's existing "never invent a fact" principle, applied to the reading stage instead of the reasoning stage. Nothing in the code path reformats, regexes, or "corrects" a DTC code string on the way to storage — whatever Claude returns (including a literal `?`) is stored as-is in `scan_dtc_records.code`, same as every other parser.

**Cost gating.** Photo extraction is the first point in this pipeline where the free, ungated extraction stage makes a real AI API call (every document parser only ever touches locally parsed bytes). The extract route gates it behind the same `canAccessFullDiagnostics(plan)` entitlement the downstream diagnosis already requires (Pro/Workshop) — a Free-tier account can never get a diagnosis anyway, so ungated vision-API spend leading nowhere would make no sense. Document-based extraction is unaffected and stays free/ungated.

**Upload limits** (`src/lib/env.ts`, all overridable via env vars — see below): per-image size, image count per case, combined size per case, max accepted pixel dimensions (reject), and a downscale target dimension (excessively large but valid images are shrunk before sending to Claude; small images are never upscaled).

## AI workflow

Single provider today: Claude (`AnthropicDiagnosticProvider`), via the `DiagnosticAIProvider` adapter interface. A verifier/reviewer provider (OpenAI, Gemini) can be added later by implementing that interface — no OpenAI/Gemini SDK or key is wired in this pass. The consensus/confidence engine (`confidence.ts`) already branches on `results.length > 1` (provider agreement on the top-ranked cause raises the base score, disagreement lowers it); that branch is simply inert until a second provider exists. This applies to the diagnosis stage only — the separate, photo-upload-only vision extraction call described above is a transcription step, not a diagnosis, and isn't part of this consensus engine.

The model call uses forced Claude tool-use (`tool_choice: { type: "tool", name: "submit_diagnosis" }`) against a JSON schema mirroring `DiagnosticAiOutputSchema` — never free-text parsing. A failed `safeParse` of the response is treated as a provider failure.

The prompt has its own admin-editable system-prompt key (`admin_settings.scan_diagnostic_ai_system_prompt`), separate from the AI chat assistant's `ai_system_prompt` key, with a non-negotiable safety suffix appended server-side after the editable part (mirrors `src/lib/ai/assistant.ts`'s pattern).

Curated DTC content already in this app (`dtc_codes` table) enriches the prompt via `findKnownDtcContext()` when a code has a curated match — read-only, degrades gracefully otherwise.

## Confidence formula

Base 70 (single provider). Deductions: −20 no VIN, −10 no complaint/symptoms, −15 image-only PDF, −10 unresolved extraction warnings, −25 safety verdict `block`, −10 safety verdict `warn`, −5 per AI-reported missing-information item (capped at −20 total). Clamped to `[10, 95]` — never full certainty, never total failure. Every deduction is recorded as a human-readable string in `confidence_rationale` so the report can explain *why*, not just show a bare number. See `src/lib/scan-diagnostics/confidence.ts`.

## Safety rules

Deterministic, applied **after** AI reasoning (`src/lib/scan-diagnostics/safety-rules.ts`), not just prompt text:

- High-cost module (ECU/PCM/ECM/BCM/TCM/BECM/inverter/ABS module/steering rack) replacement recommended with **zero** tests → **block**.
- Same, but tests exist and don't reference that specific module → **warn**.
- High-voltage EV content without a qualified-technician/PPE/lockout-tagout warning → **block**.
- Airbag squib-circuit probing/measurement guidance → always **block**.
- Immobilizer/security-system bypass guidance → always **block**.

A `block` finding causes `redactBlockedContent()` to replace only the specific offending text with a visible notice (never a silent wipe) and appends the rule's message to the report's safety-warnings section.

## Entitlements

**Superseded by the subscription/entitlement overhaul** (`docs/PRICING_AND_ENTITLEMENTS.md`) — the table below is historical. Current numbers:

| Plan | Full reports/month | Full reports/day | Export | Feedback history |
|---|---|---|---|---|
| Free | 0 (2 previews/day instead — shared with the chat feature) | — | No | No |
| Pro | 30 | 5 | Yes | No |
| Workshop | 120 | 15 | Yes | Yes |

`src/lib/scan-diagnostics/entitlements.ts` now delegates to the canonical `AI_DIAGNOSTIC_ENTITLEMENTS` registry in `src/lib/pricing.ts` rather than its own `SCAN_DIAGNOSTIC_LIMITS` (removed). Feedback *submission* is available on every plan (closing the loop on one's own case is low-cost); only the cross-case feedback-history rollup is Workshop-gated.

Usage is idempotent per case via the shared `ai_diagnostic_usage` ledger (`recordAiDiagnosticUsage`/`releaseAiDiagnosticUsage`, see `docs/AI_USAGE_LIMITS.md`) — a retry after a released failure re-reserves fresh; a retry after success is a no-op.

Photo-upload extraction has its own, separate gate on top of the above: `canAccessFullDiagnostics(plan)`, checked in the extract route before any Claude Vision call is made (see "Photo/screenshot upload" above) — a Free-tier account is turned away before incurring any vision-API cost, not after.

## Known limitations

- **OCR is still not implemented for document uploads.** An image-only PDF (detected via average extractable characters per page) still returns a clear warning and asks the user to enter vehicle/DTC info manually — this is unchanged by the photo-upload feature. `src/lib/scan-diagnostics/ocr/types.ts` defines an `OcrProvider` extension point — unimplemented, not a promise of upcoming work. (Uploading the *photo itself*, rather than a PDF containing a photo, goes through Claude Vision extraction instead — see above; the two are different upload types with different pipelines.)
- **Real-device HEIC decoding hasn't been verified against an actual iPhone photo in this environment** — no sample `.heic` file was available during development. `heic-convert`'s integration is covered by a unit test with a mocked decoder (`test/scan-image-processing.test.ts`), but end-to-end correctness on a real iPhone-captured HEIC file should be confirmed against production.
- **No vendor-specific parsers.** Autel/Launch/Topdon/Techstream/GDS2/ISTA/ODIS/FORScan exports are handled by the generic format parsers (TXT/CSV/JSON/XML/HTML/PDF) plus the shared DTC-regex pass — not by field-mapping each vendor's specific export schema. The parser registry (`registry.ts`) is designed so a vendor-specific parser can be prepended later without touching the rest of the pipeline.
- **Single AI provider.** No OpenAI or Gemini integration exists in this codebase. The `DiagnosticAIProvider` interface and the confidence engine's multi-provider branch are ready for it; nothing is stubbed.
- **No background job queue.** Every stage is a synchronous, retryable, staged API route — matching this repo's existing pattern (no queue exists anywhere else in the app either). This is a deliberate architectural choice, not a stopgap.
- **No dedicated e2e test framework.** This repo has no Playwright (or similar) setup. Test coverage is vitest unit/integration-style tests with a small in-memory fake Supabase query builder (`test/mocks/fake-supabase.ts`) and mocked AI provider — no live end-to-end browser test exists for this feature.
- **UI is English-only at launch.** Every other page in this app goes through `next-intl` with parallel `messages/en.json`/`messages/es.json` catalogs; fully wiring this feature into that system (dozens of new strings across the upload form, review form, and 10+ report sections) was out of scope for this pass. Only the one new nav-link string was added to both locale files. A full localization pass is a natural follow-up, following the same pattern as the rest of the app's `[locale]` message catalogs.
- **Report export is browser printing only** (`window.print()` + a `@media print` block) — no PDF-generation library was added, matching the brief's own guidance not to introduce a heavy PDF system for v1.
- **Vercel serverless body-size limit.** The configured 15 MB max upload size is larger than Vercel's default serverless function request-body limit (4.5 MB) — files above roughly that size may fail to reach the upload route in production even though the app's own validation would accept them. A direct-to-Supabase-Storage signed-upload-URL flow (bypassing the Next.js server entirely for the upload bytes) would resolve this and is a reasonable follow-up.

## Environment variables

Added to `.env.example` (placeholders only):

```
NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED=false   # feature flag — the go-live switch
SUPABASE_STORAGE_BUCKET_SCAN_FILES=diagnostic-scan-files
SCAN_FILE_MAX_SIZE_BYTES=15728640            # 15 MB — document uploads

# Photo/screenshot upload (requires migration 0046) — all optional, defaults shown
SCAN_IMAGE_MAX_SIZE_BYTES=10485760           # 10 MB per photo
SCAN_IMAGE_MAX_COUNT=10                      # max photos per case
SCAN_IMAGE_MAX_TOTAL_SIZE_BYTES=41943040     # 40 MB combined per case
SCAN_IMAGE_MAX_PIXEL_DIMENSION=8000          # reject a photo larger than this on either axis
SCAN_IMAGE_DOWNSCALE_MAX_DIMENSION=2400      # shrink (never upscale) to at most this before sending to Claude
```

No new secrets — reuses the existing `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
