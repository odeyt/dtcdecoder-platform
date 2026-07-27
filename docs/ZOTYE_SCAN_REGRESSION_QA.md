# Zotye Scan Regression QA

Documents the regression fixture built from the real production validation case that
drove the [full scan ingestion rebuild](FULL_SCAN_INGESTION_ARCHITECTURE.md), and how to
run/extend it.

## Source

`ZYOUTE.pdf` — a LAUNCH X431 "Vehicle Diagnostic Report" for a 2017 ZOTYE Domy X7, 66
DTCs across 12 abnormal systems plus 2 systems reported OK. The report the app generated
from it originally showed only 3 DTCs (`P0015`, `P0300`, `P0303`) and reported vehicle
info, network faults, lost-communication faults, and battery faults as all "not stated."

## Fixture

`test/fixtures/zotye-scan-report.ts` — `ZOTYE_SCAN_REPORT_TEXT` is the source report's
text reconstructed verbatim (structure, module names, DTC codes, statuses, and wording
all preserved exactly, since the parser fix this validates is specifically about
correctly reading this format), with the real VIN replaced by a deterministic test VIN
(`ZOTYE_TEST_VIN = "Z0TYED0MYX7TEST01"` — structurally valid, 17 characters, no
I/O/Q, but not the real vehicle's identity). `ZOTYE_EXPECTED_SYSTEM_COUNTS` and
`ZOTYE_TOTAL_DTC_COUNT` (66) are derived constants used across the test suite so a
single source of truth backs every assertion.

## Test files

- **`test/scan-zotye-regression.test.ts`** — parser-level: vehicle year/make/model/VIN,
  scanner metadata (software version, diagnostic app version, test time, report type),
  all 66 DTCs extracted (not just the engine section's 3), the two hex-suffixed engine
  codes (`P000B`/`P000A`) the old regex dropped, 6-digit extended codes from every
  non-engine system, per-system declared-vs-extracted counts matching the source
  exactly, DTC-to-system tagging, current/history/reference-only status distinction,
  EPB/SAS recorded as systems OK (not faulted), and extraction reported complete with
  high confidence.
- **`test/scan-patterns-and-priority.test.ts`** — canonical-scan/pattern/priority level:
  vehicle metadata preserved through `buildCanonicalVehicleScan`, network/lost-comm/
  battery/bus-off/safety categories all derived from real evidence (never "not stated"
  when evidence exists), full 14-system count (12 faulted + 2 OK), all seven pattern
  types exercised (network event, low-voltage event, bus-off, active safety fault,
  single-node-failure naming a plausible target, common-cause hypothesis language), and
  the four-bucket priority hierarchy (`B1054FF`/`P000A` current → fix-first/
  diagnose-next; `P0300`/`P0303` history → monitor-recheck; `P0015`/`P000B`
  reference-only → historical-reference, never outranking a current fault).
- **`test/scan-ai-prompt-completeness.test.ts`** — the actual text sent to the AI
  provider: all 66 DTCs present (not a truncated 3-code subset), the system/module
  summary section, the detected-patterns section, all four priority groups, every
  individual DTC code appearing in the per-code listing, and extraction confidence
  reported as high (not truncated) for this fully-extracted report.
- **`test/scan-status-normalization.test.ts`** — isolated unit coverage for
  `normalizeStoredDtcStatus` (current/history/pending/permanent/intermittent/stored/
  reference-only/unknown/null) and the system-aware `dedupeDtcCodes` fix (same code +
  status from two different systems kept distinct; a genuine same-system duplicate still
  collapses).

## Required assertions checklist

| Requirement | Covered by |
|---|---|
| Vehicle year = 2017, make = ZOTYE, model = Domy X7 | `scan-zotye-regression.test.ts` |
| VIN is extracted | `scan-zotye-regression.test.ts` |
| Engine module has 5 DTCs, Transmission 14, Gateway 14 (and all other systems) | `scan-zotye-regression.test.ts` |
| Network / lost-communication / battery / bus-off faults present | `scan-patterns-and-priority.test.ts` |
| SRS `B1054FF` current and safety-critical | `scan-patterns-and-priority.test.ts` |
| `P000A` current; `P0300`/`P0303` history; `P0015`/`P000B` reference-only | `scan-zotye-regression.test.ts`, `scan-patterns-and-priority.test.ts` |
| EPB and SAS stored as OK | `scan-zotye-regression.test.ts`, `scan-patterns-and-priority.test.ts` |
| Total module count (14) and total DTC count (66) match source | `scan-patterns-and-priority.test.ts` |
| AI prompt includes all required priority groups and every DTC | `scan-ai-prompt-completeness.test.ts` |
| Report never claims vehicle/network/battery faults are "not stated" | `scan-patterns-and-priority.test.ts` (`legacyCategoryClassification` assertions) |

## Running it

```bash
npx vitest run test/scan-zotye-regression.test.ts test/scan-patterns-and-priority.test.ts test/scan-ai-prompt-completeness.test.ts test/scan-status-normalization.test.ts
```

Or as part of the full suite: `npm run test`.

## Manual verification (optional, requires a live entitled account)

To confirm the fix end-to-end against a real upload (not just the text fixture), upload
the actual `ZYOUTE.pdf` (or an equivalent multi-system LAUNCH-format report) through
`/diagnostics/upload` as a signed-in Pro/Workshop user, then check `/admin/scan-inspection?caseId=<id>`
for the same counts this fixture asserts.
