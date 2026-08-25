# M-DIAG0.1 — Safety and Extraction-Provenance Remediation Gate

**Status:** Implemented in an isolated worktree/branch, not merged, not deployed.
**Scope:** Owner decisions #1, #2, #6 (partially — instrumentation itself is out of scope, see Known Limitations), #7, #8 from the M-DIAG0.1 remediation gate. Explicitly excludes OCR, malware scanning, mobile, ELM327, pricing, workshop features, and the universal M-DIAG1 schema.

---

## 1. Verified audit findings

Before any code was written, every finding this milestone addresses was re-verified directly against the code (not taken on faith from `docs/M-DIAG0-SCANNER-PIPELINE-AUDIT.md`):

1. **Six deterministic safety rules existed, none covering brakes/steering/fuel/road-tests** — confirmed by reading `src/lib/scan-diagnostics/safety-rules.ts`'s `SAFETY_RULES` array (6 entries: `high-cost-module-replacement-no-tests`, `high-cost-module-replacement-untested`, `ev-high-voltage-missing-ppe-warning`, `airbag-squib-circuit-probing`, `immobilizer-security-bypass`, `comm-fault-module-replacement-without-power-ground-network-tests`) before any edit.
2. **Vision/photo extraction path and `parser_id="vision-extraction"`** — confirmed in `src/lib/scan-diagnostics/ai/vision-extraction.ts` and `src/app/api/scan-diagnostics/cases/[caseId]/extract/route.ts`, which sets `scan_extractions.parser_id = "vision-extraction"` only on the photo path.
3. **Provenance persistence** — confirmed `ScanExtraction.parser_id` (`src/lib/types.ts:397`) is a real, already-persisted column distinguishing every parser (`pdf-parser`, `generic-txt`, `vision-extraction`, etc.) — no new provenance column was needed.
4. **Absence of technician-facing provenance** — confirmed via a repo-wide grep for `parser_id` outside test files: prior to this milestone, the only consumer was `src/app/(app)/admin/scan-inspection/page.tsx`, an internal admin page. `ScanReportView.tsx` and `ScanExtractionReviewForm.tsx` (the two technician-facing surfaces that already receive the full `extraction` object as a prop) never read it.
5. **Silent extraction-confidence default to `"medium"`** — confirmed at `src/lib/scan-diagnostics/canonical-scan.ts:211` (pre-fix): `confidence: extraction?.extraction_confidence ?? "medium"`. This fires whenever `extraction` is `null` (no extraction row yet) or the DB column is legitimately `null` — never when a parser explicitly assessed confidence, since every real parser run (`emptyParsedScanReport()` and its overrides in `plain-text-extraction.ts`/`pdf-parser.ts`/`vision-extraction.ts`) always writes an explicit `high`/`medium`/`low` value at extraction time.
6. **Locale behavior for safety warnings** — confirmed `report-localization.ts`'s `ScanReportTranslatable` (rankedCauses/recommendedTests/missingInformation/extractionWarnings only) never included `safety.findings`; `ScanReportView.tsx` rendered `f.message` (hardcoded English from `safety-rules.ts`) directly, with no locale awareness at all.

No finding was accepted without a direct code citation; all six were reproduced exactly as the M-DIAG0 audit described.

---

## 2. Isolated worktree identity

- **Verified base**: `origin/main` fetched fresh at the start of this run — `git rev-parse origin/main` = `a7c39a4a56c9771612294e771922b081eb0fbc2a`, identical to the commit the M-DIAG0 audit cited as its production reference. Origin/main had **not** advanced, so every M-DIAG0 finding remained fully applicable with no re-assessment needed.
- **Worktree**: created via the harness's `EnterWorktree` tool (base ref = fresh `origin/main`, per project convention), physically isolated at `.claude/worktrees/safety+m-diag0-1-remediation`, verified clean (`git status --short` empty) immediately after creation and before any edit.
- **Branch**: renamed to the exact required name `safety/m-diag0-1-remediation`.
- **Import discipline**: the only file brought in from the shared checkout was `docs/M-DIAG0-SCANNER-PIPELINE-AUDIT.md` (recreated verbatim from the shared checkout's copy, then committed on its own as this branch's first commit). The 36 uncommitted Laos BCEL files and the unrelated `growth/m-growth1a-repair-governance` branch/commits in the shared checkout were never touched, read into this worktree, or referenced by any code change here.
- **No destructive action was taken in the shared checkout** at any point — no reset, clean, stash, move, or delete.

---

## 3. Safety-rule additions

Eight new deterministic, post-hoc safety rules were added to `safety-rules.ts` (alongside the six pre-existing ones, unmodified), following the exact same "signal pattern present, required-safety-language pattern absent → block" design already established by the existing EV/airbag rules — never relying on prompt compliance alone:

| Rule id | Severity | Detects |
|---|---|---|
| `brake-hydraulic-work-missing-safety-guidance` | block | Opening a brake line/hose, ABS HCU service, bleeding, or pressure testing, without manufacturer-procedure/equipment/stationary-verification language |
| `brake-unsafe-road-test-with-fault` | block | A road test recommended alongside an unresolved braking fault (fluid loss, spongy/fading pedal, loss of braking), without stationary/lift/tow mitigation language |
| `steering-work-missing-safety-guidance` | block | Rack/column removal, EPS/PSCM power-circuit work, steering-angle calibration, or lock-actuator work, without secure-support/connector-orientation/calibration language |
| `steering-lock-security-bypass` | block | An explicit instruction to bypass a steering or column lock (negation-aware, reusing the existing `hasNonNegatedMatch` helper) |
| `steering-unsafe-road-test-with-fault` | block | A road test recommended alongside heavy/intermittent/unavailable steering assist, without mitigation language |
| `fuel-system-pressurized-work-missing-safety-guidance` | block | Opening a pressurized fuel system, GDI/common-rail work, pump activation, leak testing, or tank/vapor work, without pressure-relief/ventilation/fire-precaution language |
| `fuel-system-ignition-source-hazard` | block | Fuel-system work combined with an ignition source (open flame, spark-producing tool, non-intrinsically-safe test light) — flat prohibition, no exception |
| `unsafe-road-test-general-hazard` | block | A road test recommended alongside any of: fuel leak, unsecured component, airbag/SRS hazard, HV isolation fault, severe overheating, unstable charging voltage, or tires/wheels/suspension unsafe for travel, without stationary/lift/controlled/tow mitigation language |

All eight are wired into `BLOCK_RULE_PATTERNS` so `redactBlockedContent` redacts the specific matched text (never a blanket wipe), and their messages are appended to `safetyWarnings`, matching the existing rule behavior exactly.

The proactive prompt layer (`shared-prompt.ts`'s `SAFETY_SUFFIX_CORE`) was also extended with four new non-negotiable bullets covering the same four categories, so the model is instructed up front, not just corrected after the fact. `DTCDECODER_DIAGNOSTIC_PROMPT_VERSION` was bumped to `"2026-08-safety-remediation-v4"` so every past AI run remains traceable to the exact instruction set that produced it.

### Allowed vs. blocked examples

| Scenario | Result |
|---|---|
| "ABS wheel-speed sensor code correlates with an intermittent pulsation complaint... read live wheel-speed sensor data" | **Allowed** — ordinary electrical diagnosis, no hydraulic/procedural work mentioned |
| "Bleed the brakes" (no procedure/equipment/stationary-test language) | **Blocked** — `brake-hydraulic-work-missing-safety-guidance` |
| "Bleed the brakes following the manufacturer's bleeding procedure with a pressure bleeder... verify a firm pedal with a stationary test before any road test" | **Allowed** — required guidance present |
| "Road test the vehicle to confirm the spongy brake pedal" | **Blocked** — `brake-unsafe-road-test-with-fault` |
| "Do not road test — first confirm a firm pedal with a stationary test" | **Allowed** — converted to a stationary test as required |
| "Test steering angle sensor signal circuit for continuity" | **Allowed** — electrical diagnosis, no rack/column/lock work |
| "Remove the steering column to inspect the coupler" (no support/orientation/calibration language) | **Blocked** — `steering-work-missing-safety-guidance` |
| "The electronic steering lock actuator failed to release — test the lock solenoid and read its status" | **Allowed** — legitimate diagnosis, not a bypass instruction |
| "Bypass the steering lock and clear the fault" | **Blocked** — `steering-lock-security-bypass` |
| "Open the fuel rail to check fuel pressure" (no pressure-relief/ventilation language) | **Blocked** — `fuel-system-pressurized-work-missing-safety-guidance` |
| "Activate the fuel pump and use a test light near the fuel line to check for spark" | **Blocked** — `fuel-system-ignition-source-hazard` (flat prohibition) |
| "Road test the vehicle to confirm the check-engine light stays off" | **Allowed** — no hazard present |
| "Road test the vehicle despite a known fuel leak" | **Blocked** — `unsafe-road-test-general-hazard` |
| "Given the reported fuel leak, do not road test — tow the vehicle" | **Allowed** — converted to a towing recommendation as required |

All pre-existing EV/airbag/immobilizer rule behavior — including the legitimate-diagnosis vs. bypass distinction already proven for the immobilizer rule — is unchanged and still passes its original tests.

---

## 4. Provenance model

`ScanReportVisibleResult` gained one new field, `extractionProvenance: "deterministic_parser" | "ai_assisted_vision" | "unknown"`, computed by the new `extractionProvenanceFrom()` helper in `src/lib/ai-diagnostics/redaction.ts` directly from the already-existing `scan_extractions.parser_id` column — **no new provenance tracking system was introduced**, per the owner instruction. `"unknown"` only when no extraction row exists yet for the case. It is part of the always-visible `base` object (same visibility tier as `vehicleSummary`/`dtcs`/`safety` — present at both preview and full access levels, since it is deterministic, never AI-generated content).

---

## 5. Technician-facing UI behavior

Two surfaces now show the label, satisfying the requirement that it appear where the technician reviews facts **before diagnosis**, not only in the internal admin page:

1. **`ScanExtractionReviewForm.tsx`** (the pre-analysis review/edit screen — status `extraction_review`): a non-alarming amber notice banner appears at the top of the form when `extraction.parser_id === "vision-extraction"`, reading *"AI-assisted image extraction — This vehicle and DTC data was read from your photo(s) by AI, not extracted deterministically from a text document. Verify every field against the original image before continuing."*
2. **`ScanReportView.tsx`** (the completed report): the same-styled notice appears in the Vehicle Information section when `visibleResult.extractionProvenance === "ai_assisted_vision"`, and a separate small note explains an `"unknown"` extraction-confidence value without implying failure.
3. **`report-copy-format.ts`** (the "Copy report" text output): a one-line note is included when the provenance is AI-assisted, satisfying "included in relevant print/copy output where practical." Print output itself is the same live DOM as the on-screen report (see the M-DIAG0 audit §4.5), so the on-screen badge already appears there too.

No internal provider name (OpenAI) or raw prompt is exposed in any of these surfaces — the label says "AI-assisted," nothing more specific. Original source images remain reachable exactly as before (same signed-URL/ownership-checked download route), unchanged by this milestone. Both new UI notices use the existing responsive Tailwind classes already used throughout these components, so they render correctly on mobile and desktop without any new breakpoint-specific code.

---

## 6. Confidence semantics

`CanonicalExtractionQuality.confidence` (`canonical-scan.ts`), `ScanExtractionQualitySummary.confidence` (`redaction.ts`), and `ExtractionQualitySummarySchema.confidence` (`schemas.ts`, the Zod schema validating the AI-facing canonical input) all widened from `"high" | "medium" | "low"` to `"high" | "medium" | "low" | "unknown"`. The single fallback site (`canonical-scan.ts:211`) changed from `?? "medium"` to `?? "unknown"`.

**No migration was needed or performed.** The underlying `scan_extractions.extraction_confidence` DB column was already nullable (`"high" | "medium" | "low" | null`) and remains exactly that — `null` continues to mean "no signal recorded" in the database; `"unknown"` is purely an application-layer interpretation of that `null` at the point the value is read into the canonical view. Every parser (`plain-text-extraction.ts`, `pdf-parser.ts`, `vision-extraction.ts`, and the `emptyParsedScanReport()` default) still explicitly assigns a real `high`/`medium`/`low` value at extraction time exactly as before — this milestone did not touch parser-side confidence assignment, only the read-time fallback for the case where no extraction (or a legacy pre-field row) exists.

`shared-prompt.ts`'s AI-facing rendering of extraction confidence was updated so `"unknown"` reads as *"not assessed (no confidence signal was recorded for this extraction — do not assume this means low quality)"* rather than the bare word "unknown," so the model doesn't misinterpret it as a fourth quality tier.

`confidence.ts` (the overall diagnostic-confidence scoring formula) was **not modified** — it never read the `high/medium/low` confidence enum in the first place (only `truncated` and `dtcsExpected`), so there was no risk of `"unknown"` leaking into the score, and no change was needed there.

---

## 7. Localization behavior

Per the owner instruction — "do not redesign the localization system" and "do not add machine translation calls solely for deterministic safety messages" — safety-rule text is now rendered through the **existing static next-intl message catalog**, not a new AI translation call:

- A new `scanSafetyRules` namespace was added to all 12 live locale files (`en, es, fr, de, pt-BR, vi, zh-CN, ja, ko, th, lo, km`), keyed by `ruleId`, containing all 14 rule messages (6 pre-existing + 8 new).
- `ScanReportView.tsx` looks up each finding's message via `resolveLocalizedSafetyMessage()` (new, in `src/lib/scan-diagnostics/safety-rule-i18n.ts`), which tries the locale catalog by `ruleId` and falls back to the canonical English text (`SafetyFinding.message`, still defined once in `safety-rules.ts`) if the lookup throws or returns empty — a locale missing a key degrades to English, never to a blank or broken warning.
- The canonical English message is unconditionally still stored in `scan_reports.safety_warnings` exactly as before (no change to persistence), preserving it for internal auditability regardless of what a viewer's UI displays.
- DTC codes, module identifiers, and all other technical fields remain structurally excluded from any translation path — this was already true before this milestone (see M-DIAG0 audit §4.6/§12) and is unaffected by adding safety-rule message translation, since `ruleId` (the lookup key) and the technical fields on a `ScanDtcRecord`/`CanonicalDtc` are never themselves passed through `resolveLocalizedSafetyMessage` or any translator.
- `report-copy-format.ts`'s plain-text export intentionally continues to render safety-warning text in canonical English only (matching its existing all-English design, per the M-DIAG0 audit's own note that this export is a narrower, by-design subset of the full view) — this is disclosed as a known limitation below, not silently left inconsistent.

---

## 8. Tests and results

- `npx tsc --noEmit` — clean, no errors.
- `npx eslint` on every changed source file — clean, no errors or warnings.
- `npx vitest run` targeted sweep — **19 test files, 212 tests, all passing**: the 3 new files (`scan-provenance-confidence.test.ts`, `scan-safety-localization.test.ts`, plus the 21 new cases added to `scan-safety-rules.test.ts`) plus 16 pre-existing files re-run to prove no regression, including `ai-diagnostics-redaction.test.ts`, `diagnostic-engine-security.test.ts`, and `scan-workbench.test.ts` (tenant isolation/redaction — Phase 6 #18, unchanged), and `scan-analyze-route.test.ts`/`scan-openai-provider-truncation.test.ts` (existing EV/airbag/immobilizer coverage — Phase 6 #9/#10, unchanged).
- `npm run build` — the Turbopack compile and TypeScript phases both succeeded (**"Compiled successfully in 42s", "Finished TypeScript in 21.1s"**); static page generation then failed on an unrelated, expected cause — `Missing required env var: NEXT_PUBLIC_SUPABASE_URL` — because this freshly created isolated worktree has no `.env.local` (git-ignored, never copied from the shared checkout by design). This is an environment-configuration gap in the fresh worktree, not a defect in this change; the code-correctness signal (compile + typecheck) is clean.
- No pre-existing test failure needed separating from a milestone-introduced one — the full targeted sweep started and ended green.

Phase 6's 18-item checklist is covered: items 1–10 by the new/existing `scan-safety-rules.test.ts` cases (see the allowed/blocked table in §3), items 11–13 by `scan-provenance-confidence.test.ts`, items 14–15 by the same file's confidence tests, item 16 by `scan-safety-localization.test.ts`'s structural-untouched test, item 17 by the same file's 12-locale completeness check, and item 18 by re-running `ai-diagnostics-redaction.test.ts`/`diagnostic-engine-security.test.ts`/`scan-workbench.test.ts` unchanged.

---

## 9. Changed files

**Modified** (12 source/test files + 12 locale files):
`src/lib/scan-diagnostics/safety-rules.ts`, `src/lib/scan-diagnostics/ai/shared-prompt.ts`, `src/lib/ai-diagnostics/redaction.ts`, `src/lib/scan-diagnostics/canonical-scan.ts`, `src/lib/types.ts`, `src/lib/scan-diagnostics/schemas.ts`, `src/lib/scan-diagnostics/report-copy-format.ts`, `src/components/ScanExtractionReviewForm.tsx`, `src/components/ScanReportView.tsx`, `test/scan-safety-rules.test.ts`, `test/report-copy-format.test.ts`, `test/scan-report-workbench-components.test.tsx`, `messages/{en,es,fr,de,pt-BR,vi,zh-CN,ja,ko,th,lo,km}.json`.

**New**: `src/lib/scan-diagnostics/safety-rule-i18n.ts`, `test/scan-provenance-confidence.test.ts`, `test/scan-safety-localization.test.ts`, `docs/M-DIAG0-SCANNER-PIPELINE-AUDIT.md` (imported from the shared checkout as this branch's base commit), this document.

**No migration file was created.** No database schema change was needed for this milestone.

---

## 10. Known limitations

- **Non-English safety-rule translations (all 12 locales, 8 new + 6 pre-existing rules) have not been reviewed by a native-speaking automotive technical reviewer.** Spanish, French, German, Portuguese (BR), Vietnamese, Simplified Chinese, Japanese, and Korean translations were produced with reasonable confidence; Thai, Lao, and especially Khmer carry materially higher uncertainty given lower training-data coverage of automotive technical register in those languages. Given this platform's real Lao-market focus (see the Laos BCEL payment work in this same repository), professional review of the Lao and Khmer safety text specifically is recommended before those locales are relied upon for real repair decisions. The fallback design means an incorrect translation would still be a real (if imperfect) safety message, never a blank one — but "imperfect" is not "verified," and this milestone does not claim otherwise.
- The plain-text "Copy report" export intentionally keeps safety-warning text in English only, even for a non-English report (§7) — a narrower, by-design gap in that one export path, consistent with its pre-existing all-English design noted in the M-DIAG0 audit.
- **Deterministic OCR for image-only PDFs**, **malware scanning**, the **universal M-DIAG1 diagnostic schema**, **M-DIAG5 KPI instrumentation**, **ELM327 support**, and **licensed technical data** are all explicitly out of scope for this milestone, per the owner's instructions, and none of them were implemented, scaffolded, or stubbed here.
- The 8 new safety rules are regex/keyword-pattern-based, matching the pre-existing 6 rules' design exactly — like the existing rules, they can in principle be evaded by unusual phrasing the AI might use, or produce a false positive on an unusual but legitimate phrasing. This is the same class of limitation the pre-existing 6 rules already carry (deterministic pattern matching, not semantic understanding) and is not a regression introduced by this milestone.
- Launch X431 and Autel MaxiSys remain "provisional first-class scanner formats" only in the sense that the pre-existing generic parsers already handle LAUNCH-style reports reasonably well (per the M-DIAG0 audit's `scan-zotye-regression.test.ts` finding); no brand-specific parser was added in this milestone — that remains M-DIAG1/M-DIAG2 scope.

---

## 11. Rollback plan

No database migration exists for this milestone, so rollback is a pure code revert:

1. `git revert` the three commits on `safety/m-diag0-1-remediation` (or simply do not merge the branch) — every change is additive to existing files, with no schema change and no new persisted-data shape (the `extractionProvenance` field is computed at read time from an already-existing column, never written to the database).
2. If any commit has already been merged to `main` and deployed, reverting is safe at any time: the new safety rules only ever *narrow* (redact/block) previously-unblocked content, so reverting only *removes* redaction — it cannot corrupt or lose any previously-generated report. The confidence-semantics change only affects how a `null` DB value is *displayed/reasoned about*, never what is stored. The provenance field is purely additive and read-only.
3. No customer-visible data would be lost or need backfilling on rollback.

---

## 12. Verdict for M-DIAG1

**GO WITH CONDITIONS**, carrying forward the M-DIAG0 audit's own conditions minus the two this milestone directly closes:

- Owner decisions #1 (safety-rule gaps) and #2 (AI-extraction provenance labeling) are **closed** by this milestone.
- Owner decision #7 (confidence semantics) is **closed** by this milestone.
- Owner decision #8 (safety-warning localization foundation) is **closed** for the infrastructure and English/major-language coverage; **partially open** pending native review of Lao/Khmer text specifically (§10).
- Owner decisions #3 (OCR), #4 (malware scanning), #5 (scanner-format prioritization), and #6 (KPI instrumentation) remain **explicitly out of scope** here and unresolved, exactly as the owner instructed — M-DIAG1's schema work should proceed with these still open, per the original M-DIAG0 recommendation that the provenance field and expanded safety-rule set be the schema-design-stage deliverables, which this milestone has now delivered ahead of M-DIAG1 rather than deferring them into it.

No blocker was found that would prevent M-DIAG1 schema work from proceeding once this branch is reviewed and merged.
