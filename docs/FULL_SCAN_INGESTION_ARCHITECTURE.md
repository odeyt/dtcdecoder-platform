# Full Scan Ingestion Architecture

Documents the scan-report ingestion pipeline as rebuilt in response to a real production
validation case (see [`FULL_SCAN_DATA_LOSS_AUDIT.md`](FULL_SCAN_DATA_LOSS_AUDIT.md) for
the root-cause investigation this responds to). A 66-DTC, 12-system LAUNCH X431 scan for
a 2017 ZOTYE Domy X7 was previously reduced to 3 DTCs and no vehicle info — this
document describes the fix and the architecture that replaced it.

## Root cause (summary — full detail in the audit doc)

One primary bug: the DTC-code regex required a clean word boundary immediately after
3–4 plain decimal digits, silently dropping any code with a hex letter glued on
(`P000B`, `B1054FF`) or any 5–6 digit extended manufacturer format with no separator
(`U121183`, `P184481`) — both real, common formats outside the US/EU market. Two
independent, compounding bugs alongside it: the lost-communication phrase list was too
narrow, and vehicle Make used a fixed ~30-brand whitelist with no Model extraction at
all, for any brand. One display bug hid a correctly-extracted Year because the "Vehicle"
line required Year+Make+Model all present at once.

## Pipeline

```
PDF upload
  → src/lib/scan-diagnostics/parsers/pdf-parser.ts        (unpdf text extraction, per-page)
  → src/lib/scan-diagnostics/parsers/plain-text-extraction.ts
      → extractLabeledField()   — generic "Label: value" vehicle/scanner metadata
      → src/lib/scan-diagnostics/parsers/system-sections.ts
          → extractSystemSections()  — system headings, "DTC (N)" declared counts,
                                        "systems reported OK" list
      → src/lib/scan-diagnostics/parsers/dtc-extraction.ts
          → extractDtcCodesFromText()  — broadened DTC_PATTERN + trailing-status split
  → src/lib/scan-diagnostics/extraction.ts persistExtraction()
      → scan_extractions (vehicle + scanner metadata + extraction-quality columns)
      → scan_dtc_records (+ system_name, source_page, source_text, relevance flags)
      → scan_systems (declared vs extracted count per system)
  → src/lib/scan-diagnostics/canonical-scan.ts buildCanonicalVehicleScan()
      → src/lib/scan-diagnostics/patterns.ts detectPatterns()      → scan_patterns
      → src/lib/scan-diagnostics/priority.ts computeDiagnosticPriority()
  → src/lib/scan-diagnostics/canonical-input.ts buildCanonicalDiagnosticInput()
  → src/lib/scan-diagnostics/ai/anthropic-provider.ts buildUserPrompt()
  → Anthropic (submit_diagnosis tool call)
  → src/lib/scan-diagnostics/confidence.ts computeConfidence()
  → src/lib/scan-diagnostics/report.ts assembleAndPersistReport()
  → src/lib/scan-diagnostics/report-access.ts / src/lib/ai-diagnostics/redaction.ts
  → src/components/ScanReportView.tsx
```

## Parser behavior

### DTC extraction (`dtc-extraction.ts`)

```
/\b([PBCU][0-9A-F]{4,6})(-[0-9A-Z]{1,3}|\.[0-9A-Z]{1,3})?\b/gi
```

Matches a letter followed by 4–6 hex-valid characters (was `\d{3,4}`, decimal-only).
A standard 4-digit code (`P0300`) still matches exactly as before — the next character
after 4 digits is a non-hex boundary (space, punctuation), so the regex naturally stops
there. An extended 6-character code (`U121183`) or a hex-suffixed one (`P000B`,
`B1054FF`) now matches its full length. The optional `-`/`.` suffix group (manufacturer
subcodes like `P1234-16`) is unchanged.

Status text is now captured from the SAME line, when present at the very end
(`TRAILING_STATUS_PATTERN`) — this scanner class puts status after the description on
one line ("...Timing Over-Retarded Generic Type DTC,reference Only"), not in a separate
column. `"reference only"` is recognized as its own distinct phrase, not folded into
current/history.

### Vehicle/scanner metadata (`plain-text-extraction.ts`)

`extractLabeledField(text, labels)` is a generic `"Label: value"` line matcher — reads
`Year:`, `Make:`, `Model:`, `Engine:`, `Mileage:`, `Vehicle Software Version:`,
`Diagnostic Application Version:`, `Diagnostic path:`, `Test Time:` directly, for **any**
brand or scanner tool, rather than requiring the value to already be on a hardcoded
whitelist. `extractMakeFromProse()` (the old whitelist-based keyword match) is kept only
as a fallback for sources with no explicit label at all. `Model` has no whitelist
fallback — this is genuinely new extraction capability, not a fix to an existing one
(none existed before).

Scanner brand detection (`SCANNER_BRAND_KEYWORDS`) is deliberately best-effort —
a report's brand is frequently a logo image with no extractable text, so absence here
is expected and never treated as an extraction failure.

### System/section detection (`system-sections.ts`)

Detects a system heading (the non-blank line immediately preceding a `DTC (N)`
declaration) and a `"The following systems are OK"` numbered list, tagging every DTC
found under a heading with that system name and incrementing the system's extracted
count. Produces `ParsedSystemSection[]` with `dtcCountReported` (the source's own
declared count) vs `dtcCountExtracted` (what this parser actually found) — the
mechanism extraction-completeness validation is built on.

**Dedup key change:** `dedupeDtcCodes`'s key now includes `systemName`, not just
`module`+`code`+`status`. A multi-system report can legitimately report the SAME code
(no distinct module) from two different systems with the same status text — e.g.
`U012100` appears under both "Electric Power Steering" and "A/C System" with status
History in the Zotye case. Without `systemName` in the key, the second occurrence was
silently discarded as a false duplicate (this was caught and fixed during this pass —
see `scan_dtc_records_dedup_idx` in migration 0028).

## Canonical scan data model (`canonical-scan.ts`)

`buildCanonicalVehicleScan(scanCase, extraction, dtcRecords, systems)` is a pure,
synchronous projection over already-fetched DB rows — **not** a second copy of the
schema. It assembles `CanonicalVehicleScan` (source metadata, vehicle, per-system DTC
lists, `derivedCategories`, `extractionQuality`) from the same tables every other part
of the app already reads. This is the single read-model the pattern engine, priority
engine, AI-input builder, report UI, and admin inspection screen all consume — one
source of truth (the DB), one typed view over it.

Per the "canonical facts vs AI interpretation" boundary: everything in this file is
deterministic. The AI's `rankedCauses`/`recommendedTests` output is never read back
into a `CanonicalVehicleScan` field.

## Status normalization

`ScanDtcStatus` gained two values: `reference_only` (the source's own "Generic Type DTC,
reference Only" phrasing — previously silently discarded to `null`) and `unknown` (any
OTHER non-empty, unrecognized status text — distinct from `null`, which means no status
text was present in the source at all). See `normalizeStoredDtcStatus()` in
`extraction.ts`.

## Category derivation (`category-classification.ts`)

- **Lost-communication** pattern widened from `lost communication|no communication` to
  also match `Frame Lost`, `Node Missing`, `Message Lost/Timeout`, `Interrupted`,
  `Cannot Receive`, `Signal Missing` — phrasings the original pattern missed even after
  the DTC-extraction bug was fixed.
- **Bus-off** is a new category (`findBusOffCodes`, `busOffRelevance` column) — had no
  home before.
- Per-DTC relevance flags (`safety_relevance`, `network_relevance`, `battery_relevance`,
  `bus_off_relevance`) are computed once at extraction time and persisted on
  `scan_dtc_records`, so the report UI and admin screen never re-derive them from
  description text on every read.

## AI context strategy (`canonical-input.ts`, `anthropic-provider.ts`)

The AI's user-prompt now includes, in addition to the unchanged full per-DTC listing
(never capped under normal conditions): a system/module summary with
declared-vs-extracted counts, the deterministic patterns detected, the deterministic
priority grouping, and extraction-quality/confidence. `buildUserPrompt` places NO cap on
the DTC listing below `MAX_FULL_DTC_LISTING` (150) records — the Zotye case's 66 DTCs
were never near any limit; the cap exists only as a forward-looking safeguard for a
pathologically large report, and even then only ever drops reference-only/history codes
with no special relevance, recording `omittedFromPrompt` explicitly rather than silently
truncating. Current, safety-relevant, network, battery, and bus-off codes are NEVER
omitted regardless of report size.

## Extraction completeness validation

`ParsedExtractionQuality.truncated` is `true` when any system's `dtcCountExtracted` is
less than its own declared `dtcCountReported`. This flags a real, detectable
under-extraction rather than silently presenting a partial DTC list as complete — the
report UI shows a visible warning, the AI prompt includes an explicit
"do not assume this list is exhaustive" note, and the confidence engine applies a -15
penalty.

## Migration requirements

`supabase/migrations/0028_full_scan_extraction.sql` — additive only:
- Widens `scan_dtc_records.status` CHECK to add `reference_only`/`unknown`.
- Adds `system_name`, `source_page`, `source_text`, `safety_relevance`,
  `network_relevance`, `battery_relevance`, `bus_off_relevance` to `scan_dtc_records`.
- Adds scanner/report metadata + extraction-quality columns to `scan_extractions`
  (chosen over a new `scan_extraction_quality` table — it's the same one-row-per-case
  extraction pass already represented there).
- Widens the existing `scan_dtc_records_dedup_idx` unique index to include
  `system_name`.
- New tables `scan_systems` and `scan_patterns`, both with owner-read RLS matching the
  existing `scan_dtc_records` policy pattern.

No existing column is dropped, renamed, or narrowed. No existing row's data changes
meaning.

## Rollback

Revert the application code to before this change and the additive columns/tables
simply go unused — no data loss, no schema incompatibility. The widened
`scan_dtc_records_dedup_idx` and `status` CHECK remain harmlessly permissive if rolled
back (older code never writes the new values). `scan_systems`/`scan_patterns` can be
dropped independently if ever needed; nothing else references them by foreign key.

## Known limitations

- System-heading detection is heuristic (a non-blank line immediately preceding a
  `DTC (N)` declaration) — a scan-tool export with a materially different layout may not
  be recognized as having system sections at all, in which case DTCs are still extracted
  correctly but without a `systemName` tag (matches the pre-existing flat-list behavior
  for simple, single-system reports).
- No raw uploaded-file text is stored anywhere in this schema (by design — only
  structured extracted fields) — the admin inspection screen shows the canonical
  structured view, not a raw-text dump.
- Scanner-brand detection is a small, non-exhaustive keyword list; a brand rendered only
  as a logo image is never detected (correctly left `null`, never guessed).
- `possible_common_cause` and `single_node_failure` patterns are heuristic, evidence-
  based hypotheses, explicitly labeled as such in their evidence payload — never
  presented as a confirmed root cause.
