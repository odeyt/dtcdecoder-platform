# Phase 1 — DTC Technician™ Architecture

Overview of everything Phase 1 added, per
docs/PHASE_1_DTC_TECHNICIAN_AUDIT.md's audit and the phase brief's 8 slices.
This is the index doc — see the linked docs for depth on each area.

## What Phase 1 is

A customer-experience transformation: DTCDecoder now presents as a
premium diagnostic platform fronted by **DTC Technician™ — Professional
Diagnostic Copilot**, rather than a plain DTC search box with an "AI
Assistant" link. See docs/PHASE_1_BRANDING_STANDARD.md for the full
terminology standard.

## New surfaces

| Surface | File(s) | Doc |
|---|---|---|
| Landing hero + intake | `src/components/LandingDtcTechnician.tsx`, `src/app/[locale]/page.tsx` | docs/LANDING_DIAGNOSTIC_INTAKE.md |
| Public intake API | `src/app/api/public/diagnostic-intake/route.ts`, `src/lib/landing-intake/engine.ts` | docs/LANDING_DIAGNOSTIC_INTAKE.md |
| Authenticated handoff | `src/app/api/diagnostics/create-from-intake/route.ts`, `src/app/(app)/diagnostics/from-intake/page.tsx` | docs/LANDING_DIAGNOSTIC_INTAKE.md |
| Consultation shell | `src/components/DtcTechnicianShell.tsx`, `src/lib/dtc-technician/context.ts` | docs/DIAGNOSTIC_CONSULTATION_UX.md |
| Terminology registry | `src/lib/branding/terminology.ts` | docs/PHASE_1_BRANDING_STANDARD.md |

## What Phase 1 deliberately reused, not rebuilt

Per the audit: `searchDtcCodes`, the free-tier basic-search rate-limit
ledger (`src/lib/basic-search/usage.ts`), the anonymous-visitor cookie
(`src/proxy.ts`), `getEffectivePlan`/`AI_DIAGNOSTIC_ENTITLEMENTS` (server-
side entitlement enforcement), `createQuickDiagnosticCase` (existing
no-file-upload case creation), `LockedResultCard`/`LockedResultPanel`,
`SiteNav`/`SiteFooter`, and the entire existing `next-intl` locale
pipeline. None of this was duplicated.

## Database changes

One additive migration: `supabase/migrations/0030_phase1_analytics_events.sql`
— widens the `analytics_events.event_type` check constraint (migration
0027) to add the 12 new Phase 1 funnel events (`landing_consultation_started`,
`public_intake_basic_result_viewed`, `dtc_technician_opened`, etc.). No
existing row, column, or table is touched. No diagnostic-case schema
change was needed — `scan_cases`/`scan_dtc_records`/`scan_extractions`
already modeled everything the intake handoff needs.

## Strategic product boundary (DTCDecoder vs. Redlined1)

Unaffected by this phase — no code, database, or API changes touch
anything shared with or connecting to Redlined1. This phase is entirely
internal to DTCDecoder's existing Supabase project and repo. No explicit
future API boundary was built in this pass (not required by any of the 8
slices); if/when Redlined1 integration becomes real work, it starts from
a clean slate, not from anything added here.

## Security posture

See docs/PHASE_1_QA_REPORT.md's Security section for the full checklist.
Summary: the public intake endpoint has no code path to any AI provider
(pinned by a source-scan test); the authenticated handoff always uses the
server-resolved `auth.getUser()` id, never a client-supplied one (pinned
by test); every entitlement check reads server-side state
(`getEffectivePlan`, unchanged); no provider keys or secrets are read by
any new client component.

## Phase 2 starting point

Explicit extension points left in place, not built:
1. **`DtcTechnicianContext`** (`src/lib/dtc-technician/context.ts`) is
   display-only today — wiring it into the actual `/api/ai/assistant`
   request body (or a new context-aware endpoint) is the natural next step
   for case-aware reasoning inside the shell.
2. **Guided Diagnosis** — referenced throughout as a disabled preview
   (landing hero, consultation shell) with no backing feature. A real
   workflow builder / guided-diagnosis engine is out of Phase 1 scope
   entirely, per the brief's own boundary.
3. **"Save to Diagnostic Case" from the shell** — disabled preview, no
   backing endpoint.
4. **Per-page shell context** — the shell is mounted globally with no
   context prop; passing real per-page context (DTC result page's code,
   case page's `caseId`) is straightforward once product wants it.
5. **Multi-model orchestration** (OpenAI→Claude→Gemini) — already exists
   as a separate, disabled-by-default system (see
   docs/MULTI_MODEL_ORCHESTRATOR.md from an earlier phase); Phase 1 does
   not touch or enable it, per the brief's explicit exclusion.
6. **Specialist network / full workflow builder / advanced Evidence
   Engine** — none of these were started, per the brief's own boundary.
7. **Dedicated per-IP rate limiting** on the public intake endpoint's
   conversational steps (see docs/LANDING_DIAGNOSTIC_INTAKE.md's noted
   limitation).
8. **Non-live-locale re-translation** — 9 of 12 locale catalogs got only a
   structural key rename with English placeholder content for the new
   Phase 1 namespaces (inert until/unless those locales go live).
