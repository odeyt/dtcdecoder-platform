# Phase 1 — DTC Technician™ Experience Audit

Audit performed before any Phase 1 code changes, per the phase brief's "AUDIT FIRST"
requirement. Classifies each target requirement PASS / PARTIAL / MISSING / BLOCKED and
documents exactly what gets reused vs. built new.

## Summary

This repo already has significantly more of the underlying infrastructure than the phase
brief assumes — free-tier rate limiting, entitlement enforcement, locale routing, and a
working (if plainly-branded) AI assistant all exist and work. Phase 1's real, new work is
narrower than it first appears: **branding/terminology**, a **new landing hero component**,
a **new public intake API** (thin wrapper reusing existing rate-limited DTC lookup), a **new
authenticated handoff endpoint**, and a **new persistent consultation shell** (this genuinely
does not exist — today's AI assistant is a full page, not a floating widget). Everything else
is largely a rebrand of working systems, not new plumbing.

## Requirement-by-requirement classification

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Premium customer-facing branding | **MISSING** | No `DTC Technician™` identity exists anywhere; product is branded "DTC AI Assistant" / "DTC Decoder". |
| 2 | Landing-page redesign | **PARTIAL** | `src/app/[locale]/page.tsx` exists with hero/value-props/monetization/pricing sections already built to a good visual standard (`hover-lift`, `glass-panel`, CSS custom properties) — the STRUCTURE is reusable, but the hero's dominant element is `HeroSearch` (a plain search box), not a consultation intake. |
| 3 | DTC Technician™ consultation shell (persistent pop-up) | **MISSING** | No floating/persistent widget exists on any page. `AiAssistantChat` is a full-page component only reachable at `/ai-assistant`. |
| 4 | Public diagnostic intake | **MISSING** (endpoint) / **PASS** (underlying rate-limit + lookup infra) | No `/api/public/diagnostic-intake` route exists. But `searchDtcCodes()` (`src/lib/dtc.ts`), the anonymous-visitor cookie (`ANON_SEARCH_ID_COOKIE`, minted in `src/proxy.ts`), and the full free-tier rate-limit ledger (`src/lib/basic-search/usage.ts`, `basic_search_usage` migration 0022) already implement exactly the free/3-per-day/10-per-month policy this phase asks for — see below. |
| 5 | Authenticated handoff into a diagnostic case | **PARTIAL** | `createQuickDiagnosticCase` (`src/lib/scan-diagnostics/cases.ts`) + `QuickDiagnosticCaseInputSchema` already create a diagnostic case from typed vehicle/DTC/symptom fields with no file upload required (built in an earlier phase, "Run Full AI Diagnosis"). What's missing is the specific "preserve anonymous intake across sign-in" handoff — no intake-token/temp-record mechanism exists yet. |
| 6 | Persistent pop-up consultation interface | **MISSING** | See #3. |
| 7 | Terminology cleanup | **MISSING** | "AI Assistant", "AI Diagnostic Report", "Scan Report Analysis", "Chat" wording, etc. appear throughout `messages/*.json`, nav, account pages, report labels. |
| 8 | Multilingual compatibility | **PASS** (infrastructure) / **MISSING** (new keys) | 12 locale files exist; `en`/`es` are the only **live** locales per `isLiveLocale()` (`src/lib/i18n/locale-codes.ts`) — Thai (`th.json`) exists as a translated catalog but is **not yet a live/enabled locale** (see below, this differs from the phase brief's assumption that Thai is already live). New keys need adding to `en`/`es` at minimum; `th` can be updated too but won't be reachable via routing until it's flipped live — documented as a known gap, not silently worked around. |
| 9 | Mobile and accessibility hardening | **PARTIAL** | Existing components already use `min-h-11` (44px) touch targets, `aria-live`, `aria-expanded`/`aria-controls` on the mobile nav toggle, and responsive Tailwind breakpoints consistently — a solid baseline. No focus-trap/dialog-semantics pattern exists yet anywhere (needed new for the consultation shell, since no modal/panel component exists in this codebase at all yet). |

## Detailed audit by area

**Current landing page** (`src/app/[locale]/page.tsx`): server component, statically-generation-friendly (`generateMetadata` via `getTranslations`), sections: hero (eyebrow/headline/subheadline + `HeroSearch`), 3 value props, PDF/YouTube monetization cards, `EmailSignupForm`, pricing teaser. Reusable as the section scaffold; only the hero's dominant element changes.

**Current homepage hero** / **DTC search box**: `HeroSearch.tsx` — client component, `useTransition`-based navigation to `/dtc?q=`, 6 hardcoded suggestion chips (`P0420`, `P0171`, etc.), no locale-aware suggestion content, no intake state machine. This is the component Phase 1 replaces as the dominant hero (kept as a component — it can still be reused as the "Quick Code Lookup" entry point elsewhere, e.g. embedded in the new hero or linked from it).

**Existing diagnostic assistant / chat**: `AiAssistantChat.tsx` (full-page, `/ai-assistant` route) + `src/lib/ai/assistant.ts` (Anthropic streaming). Already has: free-plan locked state with static examples, output-language selector, abortable streaming, error/reset-at handling, `requestId`-based idempotency. This is the existing paid consultation path Phase 1's new consultation shell should eventually front — Phase 1 does not need to rebuild this generation logic, only present it (or a variant of it) inside the new shell UI and under new terminology.

**Current authenticated diagnostic routes**: `/diagnostics` (case list, hardcoded English strings, not localized), `/diagnostics/[caseId]`, `/diagnostics/upload`, `/diagnostics/quick` (the existing "Run Full AI Diagnosis" quick-case flow). All gated on `env.scanDiagnosticsEnabled()`.

**Existing scan upload entry points**: `ScanCaseUploadForm.tsx` + `/api/scan-diagnostics/cases/[caseId]/upload` — protected, authenticated-only pipeline, already validates file type/size (`src/lib/scan-diagnostics/file-validation.ts`). Phase 1's "Import Vehicle Scan" action reuses this unchanged; it must not be reachable from the new public intake endpoint.

**Existing locale routing**: `src/proxy.ts` rewrites unprefixed paths to `/en/...` internally and 307-redirects a recognized-but-not-live locale prefix back to English — deliberate, working SEO-safe design. `isLiveLocale()`/`LIVE_LOCALES`-equivalent gating lives in `src/lib/i18n/locale-codes.ts`. New Phase 1 UI must respect this — a new page must not assume every locale in `messages/` is actually routable.

**Existing translation catalogs**: 12 files, namespaced (`nav`, `footer`, `hero`, `home`, `common`, `auth`, `pricing`, `account`, `preferences`, `dtcResult`, `dtcSearch`, `dtcError`, `emailSignup`, `aiAssistant`, `history`, `meta`). English is source of truth; `next-intl` falls back to English for a missing key (verified in existing test precedent, `test/language-menu.test.ts` family). New Phase 1 namespaces will follow this same convention (e.g. a new `dtcTechnician` / `landingIntake` namespace).

**Existing pricing terminology**: `PricingPlans.tsx` + `pricing` namespace already say "Pro Technician" / "Workshop" — plan names are unaffected by this phase (Phase 1 only touches feature/consultation terminology, not plan names or prices).

**Existing report terminology**: `ScanReportView.tsx` + `report-presentation.ts` currently render "AI Diagnostic Report"-style headings, `rankedCauses`/`recommendedTests` as plain English section titles. Needs the Phase 1 terminology pass (Slice 6) — no schema change needed, only label text.

**Current account menu**: `/account` page + preferences form use "AI Usage", "Diagnosis Credits" is not yet a labeled concept (usage summary currently says "previews"/"reports", see `toLegacyUsageSummary` in `src/lib/ai-diagnostics/usage.ts`). Needs terminology pass.

**Current mobile navigation**: `SiteNav.tsx` — already has a working hamburger menu, `aria-expanded`/`aria-controls`, min-h-11 touch targets. Solid baseline to extend, not rebuild.

**Current entitlement checks**: `getEffectivePlan()`, `AI_DIAGNOSTIC_ENTITLEMENTS` (`src/lib/pricing.ts`), `recordAiDiagnosticUsage` (`src/lib/ai-diagnostics/usage.ts`) — all server-side, already the enforcement pattern this phase must reuse for "free vs. paid consultation" gating. No new entitlement primitive is needed; the new public intake endpoint and the new handoff endpoint both call into this existing layer.

**Current API routes relevant here**: `/api/ai/assistant` (paid chat), `/api/scan-diagnostics/cases/quick` (quick case creation, authenticated), `/api/scan-diagnostics/cases/[caseId]/upload` (protected upload), `/api/email-signup`, `/api/analytics/event`. No public/unauthenticated diagnostic endpoint exists today — `/api/public/diagnostic-intake` is genuinely new.

**Existing analytics events**: `src/lib/analytics/events.ts` — `ANALYTICS_EVENT_TYPES` is a fixed literal union backed by a `check` constraint in the `analytics_events` table (migration 0027). This phase's new event names (`landing_consultation_started`, `dtc_technician_opened`, etc.) require **adding to this union and a migration** to extend the check constraint — not a schema I can bypass by passing an arbitrary string.

**Current static-generation behavior**: `SiteNav` deliberately fetches auth client-side specifically so marketing pages stay statically generatable (documented in its own file header). The new landing hero and consultation shell must preserve this — any new server-rendered auth/plan check on the homepage would force it dynamic and is out of scope to introduce in Phase 1.

**Existing DTC lookup limits**: `BASIC_SEARCH_LIMITS` (`src/lib/pricing.ts`) — Free: 3/day, 10/month; Pro/Workshop: unlimit. **Matches the phase brief's stated policy exactly** — no change needed, only reuse.

**Existing diagnostic case schema**: `scan_cases`/`scan_dtc_records`/`scan_extractions` (migrations 0012+) plus the quick-case path (migration 0025, nullable `file_id`) already model everything Phase 1's handoff needs (vehicle fields, DTCs, symptoms, complaint, locale via `report_language`). No new case-schema migration is needed for the handoff itself — only a short-lived intake-token mechanism to carry anonymous state across the sign-in boundary (new).

**Existing production-safe components reused as-is**: `LockedResultCard`/`LockedResultPanel`, `UpgradeCard`, `UsageMeter`, `SafetyAlert`, `DiagnosticProgress`, `SiteFooter`, `LanguageSwitcher`, `EmailSignupForm`.

## Scope corrections vs. the phase brief

- **Thai is not currently a live locale.** The brief assumes English/Spanish/Thai are the three to verify; Thai's catalog exists but isn't routable yet. Phase 1 will update the Thai catalog for completeness (so it's ready whenever it goes live) but cannot demonstrate a working live Thai page today — documented as a known limitation, not silently substituted.
- **Free basic-search limits already match the brief exactly** (3/day, 10/month) — no "difference to document and fix" exists here, contrary to the brief's conditional wording.
- **A quick-case (no-file) diagnostic creation path already exists.** The new authenticated handoff endpoint wraps/extends this rather than building case creation from zero.
- **Analytics event types are an enum-constrained union**, not a free-form string log — new event names require a small additive migration, which the brief's own "add or update tests" implicitly permits but doesn't call out explicitly.

## What will be reused, unchanged

`searchDtcCodes`, `basic-search/usage.ts` (rate limiting), `ANON_SEARCH_ID_COOKIE` + `src/proxy.ts`, `getEffectivePlan`, `AI_DIAGNOSTIC_ENTITLEMENTS`, `createQuickDiagnosticCase`, `LockedResultCard`/`LockedResultPanel`, `LOCKED_SECTION_CATALOG`, `SiteNav`/`SiteFooter` shells, `next-intl` locale/translation plumbing, `DiagnosticProgress`, existing CSS custom-property design system (`--accent-red`, `--surface-*`, `--radius-*`, `glass-panel`/`hover-lift` utility classes).

## What is genuinely new in Phase 1

`LandingDtcTechnician` (landing intake component), `POST /api/public/diagnostic-intake`, `POST /api/diagnostics/create-from-intake` + intake-token mechanism, the persistent `DtcTechnicianShell` (floating trigger + desktop panel + mobile bottom sheet), `DtcTechnicianContext` interface, new `dtcTechnician`/`landingIntake` translation namespaces, a small additive migration extending `ANALYTICS_EVENT_TYPES`' check constraint for the new event names, and the terminology-registry module itself.
