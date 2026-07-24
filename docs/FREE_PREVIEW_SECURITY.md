# Free Preview Security — Server-Side Redaction

## The requirement

A free-tier client must never receive the locked/paid portion of an AI diagnostic result in any form — HTML, React props, client state, API JSON, page source, browser storage, analytics, or console logs. A CSS blur over the full content is explicitly insufficient (inspectable via DOM/devtools/view-source/disabling CSS). The server must not construct a response containing the locked content in the first place.

## Scan Report Analysis: redact at serve time

The AI always generates a complete analysis (unchanged by this work — generation cost is the same for every plan). What changed is the **serving** path:

- `src/app/api/scan-diagnostics/cases/[caseId]/route.ts` and `src/app/(app)/diagnostics/[caseId]/page.tsx` both call `resolveReportAccess()` (`src/lib/scan-diagnostics/report-access.ts`), which resolves the viewer's **current** plan via `getEffectivePlan()` and calls `filterScanReportForAccessLevel()` (`src/lib/ai-diagnostics/redaction.ts`).
- For `accessLevel: "preview"`, the returned object's `visibleResult` **does not have** `rankedCauses`, `recommendedTests`, `confidenceLevel`, `confidenceRationale`, or `missingInformation` as keys at all — not empty arrays, not `null`, structurally absent. Only `previewFindings` (first 2 causes, reduced to `{cause, rationale}`) and `previewTests` (first 2 tests, reduced to `{step}`) are present.
- The API route never spreads the raw `ScanReport` into its response (`{ case, files, extraction, dtcRecords, report: reportAccess }` — built field-by-field, not `...detail`), so there's no path for the full object to leak in via an unrelated field.
- `ScanReportView.tsx` only ever receives the already-filtered `reportAccess` — it has no `report: ScanReport` prop at all, so there is nothing in the component's props for a free-tier render to expose even by a future bug in the JSX.
- `test/ai-diagnostics-redaction.test.ts` asserts this with `expect(result.visibleResult).not.toHaveProperty(...)` (structural absence, not value-emptiness) and a full `JSON.stringify()` scan confirming a third, lower-ranked cause's text never appears anywhere in the serialized preview object.

Access level is re-derived from the viewer's **current** plan on every read, not stored on the report row — an upgrade retroactively unlocks a previously-generated report; a downgrade retroactively re-locks it. No stale per-row access flag to keep in sync.

## DTC Assistant chat: never generate the locked content

Chat has no structured "sections" to redact after the fact, and the wire format is raw streamed text — there's no safe place to insert a "this part is locked" boundary inside an undifferentiated byte stream. Rather than generate the full answer and truncate it (same AI cost as a paid response, and a slow-abort race could still leak bytes), a free-tier request is generated **preview-scoped from the start**:

- `buildChatPreviewSystemPromptAddendum()` (`src/lib/ai-diagnostics/redaction.ts`) is appended to the system prompt only for `accessLevel: "preview"`, explicitly bounding what the model produces (short explanation, safety classification, first two likely areas, first two checks, upgrade nudge — never a full ranked list, full test sequence, or programming/calibration guidance).
- `max_tokens` is also capped lower (`CHAT_PREVIEW_MAX_TOKENS = 500` vs. `CHAT_FULL_MAX_TOKENS = 2048`) as a second, independent bound.
- The locked-sections panel shown under a free response (`LockedResultPanel`) is **static section titles only** ("Complete Root-Cause Ranking," etc.) — never derived from the AI's actual output, so there is no real diagnostic content anywhere in that part of the DOM to inspect in the first place.

This is a deliberate architectural difference from the scan-report approach (filter-after-generation vs. constrain-during-generation), documented here rather than silently applied — both achieve the same guarantee (no locked content reaches the client), chosen per feature based on which is actually safe and low-risk given each feature's existing wire format.

## Locked-section UI

`src/components/LockedResultCard.tsx` — lock icon, section title, `aria-hidden` skeleton placeholder lines (literal generated `<div>`s, never real text), a fixed accessible string ("Full diagnostic section locked. Upgrade to Pro Technician to view it.") via `sr-only`, and an upgrade CTA. No animation on the skeleton (nothing to gate behind `prefers-reduced-motion`). Responsive via Tailwind grid utilities (`grid-cols-2` from `sm` up, one column below), no fixed widths.

## What is intentionally always visible, on every plan

Vehicle summary, the DTC code list, and all safety findings are never gated — they're either non-personalized/deterministic (vehicle info, DTC codes) or safety-critical (never worth paywalling). Confirmed in `filterScanReportForAccessLevel`'s `base` object, present identically in both `preview` and `full` branches.
