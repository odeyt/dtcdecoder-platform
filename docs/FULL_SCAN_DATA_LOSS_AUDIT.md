# Full Scan Data Loss Audit — Zotye/LAUNCH X431 Validation Case

Root-cause audit performed before any code changes, per the mandated Phase 0 gate. Traces
the real production case: `ZYOUTE.pdf` (LAUNCH X431 scan of a 2017 ZOTYE Domy X7, VIN
`LJ8F7C5G9HE020093`, 66 total DTCs across 12 systems) versus the generated
`Diagnostic Case | DTC Decoder` report, which showed only 3 DTCs and reported vehicle
info, network faults, lost-communication faults, and battery faults all as "not stated."

## Pipeline traced

```
PDF upload
  → src/lib/scan-diagnostics/parsers/pdf-parser.ts        (unpdf text extraction)
  → src/lib/scan-diagnostics/parsers/plain-text-extraction.ts  (vehicle fields)
  → src/lib/scan-diagnostics/parsers/dtc-extraction.ts     (DTC regex)
  → src/lib/scan-diagnostics/extraction.ts persistExtraction()  (scan_extractions / scan_dtc_records)
  → src/lib/scan-diagnostics/canonical-input.ts buildCanonicalDiagnosticInput()
  → src/lib/scan-diagnostics/parsers/category-classification.ts classifyDtcCategories()
  → src/lib/scan-diagnostics/ai/shared-prompt.ts buildUserPrompt()
  → OpenAI (structured JSON response)
  → src/lib/scan-diagnostics/report.ts assembleAndPersistReport()
  → src/lib/ai-diagnostics/redaction.ts filterScanReportForAccessLevel()
  → src/components/ScanReportView.tsx
```

## Loss points, classified

| # | Stage | File | Verdict | Finding |
|---|---|---|---|---|
| 1 | PDF text extraction | `pdf-parser.ts` | **PASS** | `unpdf` extracted all 4 pages of readable text correctly (confirmed by manually re-reading the source PDF — every DTC, vehicle field, and system heading is present in the raw text layer). Not an image-only PDF; the `IMAGE_ONLY_AVG_CHARS_PER_PAGE_THRESHOLD` path was never hit. |
| 2 | DTC-code regex | `dtc-extraction.ts` `DTC_PATTERN` | **FAIL** (primary root cause) | `/\b([PBCU]\d{3,4})(-[0-9A-Z]{1,3}\|\.[0-9A-Z]{1,3})?\b/gi` requires a clean word boundary immediately after 3–4 decimal digits. It silently drops: (a) any code with a hex letter glued directly on with no separator (`P000B`, `P000A`, `B1054FF`, `U0100FF`, `U0236FF`, `U0131FF`...), and (b) any 5–6 digit extended manufacturer code (`P184481`, `U121183`, `C120700`, `U11A383`, etc. — the entire Transmission/ESP/SRS/FBCM/RBCM/ICU/PEPS/EPS/AC/Gateway/SBCM sections use this format). Only 3 of 66 DTCs matched: `P0303`, `P0300`, `P0015` — all plain 4-decimal-digit codes from the Engine System section, which is also why `P000B`/`P000A` (same section, same list) were dropped alongside everything else. This is a regex-boundary bug, not a count limit, page-truncation, or prompt-size issue. |
| 3 | Vehicle Make extraction | `plain-text-extraction.ts` `extractMake()` | **FAIL** | Hardcoded whitelist of ~30 well-known global brands (Toyota, Honda, Ford, ...). ZOTYE is a real, current Chinese OEM not on that list — the function returns `undefined` regardless of the explicit `Make:ZOTYE` line in the source text. Root cause: keyword-whitelist approach, not a Zotye-specific gap — any brand outside the list fails identically. |
| 4 | Vehicle Model extraction | `plain-text-extraction.ts` | **FAIL** | No `extractModel()` function exists at all. Model is never populated from generic/PDF text for *any* vehicle, regardless of brand. |
| 5 | Vehicle Year extraction | `plain-text-extraction.ts` `extractModelYear()` | **PASS** (extraction) / **FAIL** (display) | The generic `\b(19[89]\d\|20[0-4]\d)\b` regex correctly matched `2017` and it was correctly stored in `scan_extractions.model_year`. It never reached the user — see #6. |
| 6 | Vehicle summary display | `ScanReportView.tsx` line 132 | **FAIL** | `visibleResult.vehicleSummary.modelYear && ...make && ...model ? "<year> <make> <model>" : "Not provided in report"` — an all-or-nothing check. Because Make and Model failed (#3, #4), the correctly-extracted Year was hidden too. |
| 7 | Scanner/report metadata (software version, diagnostic app version, diagnostic path, test time) | *(none)* | **BLOCKED** | No extraction logic exists for these fields at all — `ParsedScanReport`/`scan_extractions` have no columns for them. Not a bug in existing code; a genuine gap to build. |
| 8 | DTC → `scan_dtc_records` persistence | `extraction.ts` `persistExtraction()` | **PASS** | Persists every row `parsed.dtcCodes` produced, with no additional count cap, filtering, or truncation. Confirms the loss is entirely upstream at #2 — this stage faithfully stores whatever the parser handed it. |
| 9 | DTC status normalization | `extraction.ts` `normalizeStoredDtcStatus()` | **PARTIAL** | Recognizes `current`/`history`/`pending`/`permanent`/`intermittent`/`stored` via regex. Does **not** recognize "Generic Type DTC, reference Only" (the source's literal phrasing for `P0015`/`P000B`) — falls through to `null`, silently discarding the reference-only distinction rather than storing it. The DB check constraint (migration 0012) also has no `reference_only` or `unknown` value to store it as even if the code recognized it. |
| 10 | System/module section tracking | *(none)* | **BLOCKED** | Nothing in the schema or parser tracks "system name" (e.g. "1.8T Engine System") separately from a DTC's `module`, and nothing tracks the report's own declared count ("DTC (14)") versus how many were actually extracted for that section. This is why the extraction gap in #2 was silent — there was no mechanism to detect or flag "declared 14, extracted 0." |
| 11 | Systems reported OK | *(none)* | **BLOCKED** | No parsing of the "The following systems are OK: ... Electric Parking Brake System(EPB) ... Steering Wheel Angle Sensor(SAS)" section exists. Entirely unhandled today. |
| 12 | Category classification — pending/permanent/network | `category-classification.ts` `classifyDtcCategories()` | **PASS** (logic) / starved of data | The network-fault rule (`/^U/i` on the code) and pending/permanent rules (status equality) are correct and would have worked immediately if the U-codes had survived extraction. This confirms the category-classification stage is not itself the root cause for these three — it is data-starved by #2. |
| 13 | Category classification — lost-communication | `category-classification.ts` `LOST_COMM_TEXT_PATTERN` | **FAIL** (independent, compounding bug) | `/\b(lost communication\|no communication\|not communicating\|no response\|communication (fault\|loss\|error))\b/i` does not match the source's actual phrasings: "Frame Lost", "Node Missing", "Message Lost", "Interrupted", "Cannot Receive", "Signal Missing", "Timeout". Even after fixing #2, this pattern would still under-report lost-communication faults — a second, independent bug, not merely a symptom of #2. |
| 14 | Category classification — battery | `category-classification.ts` `BATTERY_TEXT_PATTERN` | **PASS** (logic) / starved of data | `/\b(battery\|system voltage\|voltage low\|low voltage\|charging system\|voltage drop)\b/i` matches "Battery Low Voltage" via the word "battery" alone. Correct logic, starved of data by #2. |
| 15 | Category classification — bus-off | *(none)* | **BLOCKED** | No bus-off category exists in `classifyDtcCategories`/`DtcCategoryClassificationSchema` at all. The source's `U000188 CAN Busoff` has nowhere to be classified into. |
| 16 | AI prompt construction | `canonical-input.ts`, `shared-prompt.ts` `buildUserPrompt()` | **PASS** | Confirmed by direct code read: `buildUserPrompt` iterates `input.dtcs` with no length cap, slice, or filter — every DTC in `scan_dtc_records` is listed verbatim in the prompt. There is no prompt-size truncation logic anywhere in this path today. If the parser is fixed to extract all 66 DTCs, all 66 will reach the AI unchanged, with no further code change required at this stage for the DTC list itself (a genuinely large multi-hundred-DTC report could still need the size-safeguard/`omittedFromPrompt` mechanism the spec asks for as a forward-looking guard, not because this case needs it at 66 records). |
| 17 | Pattern detection / diagnostic priority engine | *(none)* | **BLOCKED** | Does not exist. All ranking/pattern-recognition today happens inside the AI's own free-form reasoning, with no deterministic pre-AI pass. |
| 18 | Report rendering — category "not stated" claims | `ScanReportView.tsx` | **PASS** (rendering) / driven by upstream data | The UI faithfully renders whatever `classifyDtcCategories` returned. "NOT STATED IN REPORT" for network/lost-comm/battery was the correct rendering of incorrect upstream data (#2, #13, #15) — not a rendering bug itself. |

## Summary

**One primary root cause** (#2, the DTC regex) explains the loss of 63 of 66 DTCs and,
transitively, the false "not stated" claims for network/lost-communication/battery
categories (#12–15) and the missing pattern/priority context (#17), since those stages
never had the data to work with.

**Two independent, compounding bugs** exist alongside it: the lost-communication phrase
list (#13) and the vehicle Make whitelist / missing Model extraction (#3, #4) — these
would still misbehave even with #2 fixed, and are fixed separately in this pass.

**One display bug** (#6) needlessly hid data that *was* correctly extracted (Year).

**Six genuine gaps** (not bugs — nothing exists yet to fail): scanner/report metadata
(#7), system/section tracking with declared-vs-extracted counts (#10), systems-OK
parsing (#11), bus-off category (#15), reference-only/unknown status values (#9's DB
side), and the pattern/priority engine (#17). These are net-new capabilities built in
this pass, not fixes to existing broken code.

No evidence was found of: a hardcoded DTC count limit, an engine-only module filter,
PDF page-extraction truncation (all 4 pages were read), a prompt-size truncation cutting
the DTC list, or a schema field silently dropped during Zod validation. The failure
mode is narrower and more specific than "the pipeline truncates data" — it is "the
regex-based DTC matcher's character class doesn't cover this scanner's code formats,"
with the rest of the pipeline behaving exactly as designed on whatever it was given.
