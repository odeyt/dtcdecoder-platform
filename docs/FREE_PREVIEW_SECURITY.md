# Free Preview Security — Server-Side Redaction

> Updated for the pricing/AI-cost-control overhaul (`docs/PRICING_AND_AI_COST_AUDIT.md`).
> Free's AI-diagnostic preview allowance is now 0 — there is no "generate a
> constrained preview" code path left anywhere in the app (chat or scan).
> The sections below describe how a Free-plan viewer is kept from ever
> seeing real AI-generated content, updated for that change.

## The requirement

A free-tier client must never receive the locked/paid portion of an AI diagnostic result in any form — HTML, React props, client state, API JSON, page source, browser storage, analytics, or console logs. A CSS blur over the full content is explicitly insufficient (inspectable via DOM/devtools/view-source/disabling CSS). The server must not construct a response containing the locked content in the first place.

## Scan Report Analysis: redact at serve time

The AI always generates a complete analysis (unchanged by this work — generation cost is the same for every plan). What changed is the **serving** path:

- `src/app/api/scan-diagnostics/cases/[caseId]/route.ts` and `src/app/(app)/diagnostics/[caseId]/page.tsx` both call `resolveReportAccess()` (`src/lib/scan-diagnostics/report-access.ts`), which resolves the viewer's **current** plan via `getEffectivePlan()` and calls `filterScanReportForAccessLevel()` (`src/lib/ai-diagnostics/redaction.ts`).
- For `accessLevel: "preview"`, the returned object's `visibleResult` **does not have** `rankedCauses`, `recommendedTests`, `confidenceLevel`, `confidenceRationale`, or `missingInformation` as keys at all — not empty arrays, not `null`, structurally absent. No real AI-generated content is included at this access level at all (no `previewFindings`/`previewTests` slice of the report either, as an earlier version of this feature had) — only the deterministic `vehicleSummary`/`dtcs`/`safety` fields and the static locked-section catalog. The only way to reach `accessLevel: "preview"` at all today is a paid-plan report being viewed after its owner downgraded to Free (Free itself never generates a report to view).
- The API route never spreads the raw `ScanReport` into its response (`{ case, files, extraction, dtcRecords, report: reportAccess }` — built field-by-field, not `...detail`), so there's no path for the full object to leak in via an unrelated field.
- `ScanReportView.tsx` only ever receives the already-filtered `reportAccess` — it has no `report: ScanReport` prop at all, so there is nothing in the component's props for a free-tier render to expose even by a future bug in the JSX.
- `test/ai-diagnostics-redaction.test.ts` asserts this with `expect(result.visibleResult).not.toHaveProperty(...)` (structural absence, not value-emptiness) and a full `JSON.stringify()` scan confirming a third, lower-ranked cause's text never appears anywhere in the serialized preview object.

Access level is re-derived from the viewer's **current** plan on every read, not stored on the report row — an upgrade retroactively unlocks a previously-generated report; a downgrade retroactively re-locks it. No stale per-row access flag to keep in sync.

## DTC Assistant chat: never generate anything for Free at all

An earlier version of this feature generated a constrained, shorter "preview" answer for Free-tier chat requests (a bounded system-prompt addendum plus a lower `max_tokens`). That code path (`buildChatPreviewSystemPromptAddendum`, `CHAT_PREVIEW_MAX_TOKENS`) was **removed** once Free's preview allowance became 0 (`docs/PRICING_AND_AI_COST_AUDIT.md`) — `recordAiDiagnosticUsage` now rejects every Free-plan chat request before `streamAssistantResponse` is ever called, so there is no reduced-generation mode left to secure. `streamAssistantResponse` always generates at the one full token budget (`CHAT_FULL_MAX_TOKENS`), because it is only ever reached by a plan that's genuinely entitled to a full answer.

Instead of a live chat input that would always 429 for a Free-plan visitor, `AiAssistantChat.tsx` shows a static locked panel up front — example questions (never real generated answers) plus the same locked-sections catalog used elsewhere, with an upgrade CTA. `LockedResultPanel`'s section titles are static strings ("Complete Root-Cause Ranking," etc.), never derived from any AI output, so there is no real diagnostic content anywhere in that part of the DOM to inspect in the first place — this part of the design is unchanged from before.

## Locked-section UI

`src/components/LockedResultCard.tsx` — lock icon, section title, `aria-hidden` skeleton placeholder lines (literal generated `<div>`s, never real text), a fixed accessible string ("Full diagnostic section locked. Upgrade to Pro Technician to view it.") via `sr-only`, and an upgrade CTA. No animation on the skeleton (nothing to gate behind `prefers-reduced-motion`). Responsive via Tailwind grid utilities (`grid-cols-2` from `sm` up, one column below), no fixed widths.

## What is intentionally always visible, on every plan

Vehicle summary, the DTC code list, and all safety findings are never gated — they're either non-personalized/deterministic (vehicle info, DTC codes) or safety-critical (never worth paywalling). Confirmed in `filterScanReportForAccessLevel`'s `base` object, present identically in both `preview` and `full` branches.
