# Phase 1 QA Report

## Automated verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ Clean |
| Lint | `npm run lint` | ✅ Clean |
| Unit/integration tests | `npx vitest run` | ✅ 451 passed, 56 files (was 413 before Phase 1; +38 net new across `test/phase1-branding.test.ts`, `test/landing-intake-engine.test.ts`, `test/diagnostics-create-from-intake.test.ts`) |
| Production build | `npm run build` | ✅ Succeeded, `/en` still statically generated (`●` SSG marker unchanged), all new routes registered (`/api/public/diagnostic-intake`, `/api/diagnostics/create-from-intake`, `/diagnostics/from-intake`) |

Re-run after every slice (1 through 7), not just at the end — each commit
in the git log for this phase individually passed all four checks before
being made.

## Branding

- `test/phase1-branding.test.ts` (31 tests): confirms the old `aiAssistant`
  namespace is gone, `dtcTechnician`/`dtcTechnicianShell`/`landingIntake`
  exist with the brand name, no prohibited term appears in any migrated
  namespace (en + es) or in `ScanReportView.tsx`'s rendered labels, and
  internal provider class names are untouched.
- Manually verified (by reading, not by browser render — see below): nav,
  pricing, account, history, dtcSearch, dtcResult, report section labels.

## Landing page

- Old plain search box (`HeroSearch`) is no longer the dominant hero — it
  is nested as a secondary "Quick Code Lookup" strip beneath
  `LandingDtcTechnician`. Verified by reading `src/app/[locale]/page.tsx`.
- Public intake state machine verified by `test/landing-intake-engine.test.ts`
  (9 tests): one focused question per turn, basic result from local data
  only, free-tier limit enforcement, no paid-provider call (source-scan
  assertion), reset-to-idle behavior (component-level, not test-covered —
  see Known Gaps).
- **Not verified**: actual rendered appearance, responsive layout at any
  breakpoint, or real click-through — see "Browser verification" below.

## Entitlements / security

| Check | How verified |
|---|---|
| Public intake never calls a paid provider | `test/landing-intake-engine.test.ts` source-scan assertion (no import of anthropic/openai/gemini/ai-diagnostics modules) |
| Public intake is rate-limited | Reuses the existing, already-tested `basic-search/usage.ts` ledger; `test/landing-intake-engine.test.ts` confirms `upgrade_required` short-circuits before any lookup |
| Authenticated handoff requires sign-in | `test/diagnostics-create-from-intake.test.ts` — 401 when unauthenticated, `createQuickDiagnosticCase` never called |
| Handoff always uses the server-resolved user id | Same test file — asserts the case is created under `auth.getUser()`'s id even when the request body includes an unrelated `userId` field |
| Client-side plan manipulation fails | No new client-trusted plan field was introduced; `/api/ai/assistant` (used by the shell) still resolves plan server-side exactly as before |
| No provider key in client output | No new client component imports any provider SDK or reads any `*_API_KEY`; both new API routes are server-only route handlers |
| Locked professional previews remain static | `LandingDtcTechnician`'s basic-result view renders the pre-existing `LockedResultPanel`/`LOCKED_SECTION_CATALOG`, unchanged |

## Accessibility

Implemented (see docs/DIAGNOSTIC_CONSULTATION_UX.md for detail):
`role="dialog"`/`aria-modal`, focus trap, Escape-to-close, focus
restoration, `aria-live` on the message list, `role="alert"` on errors,
44px minimum touch targets throughout, `aria-disabled` + `title` tooltips
on not-yet-built quick actions (never a bare disabled button with no
explanation).

**Not manually verified**: actual screen-reader behavior, real keyboard
walk-through, or visual focus-ring appearance — these require a live
browser pass (see below).

## Browser verification — not completed this session

I attempted to open this session's own dev server (`dtcdecoder-dev-alt`,
port 3100) via the Browser pane multiple times across this phase
(specifically to check the new landing hero and consultation shell).
Every attempt failed with **"the Browser pane is not displayed"** on
screenshot, and page navigation was denied — an environment/display issue
in this session, not a code defect. Port 3000 was also occupied by
another session's dev server for the duration of this work.

**Consequently, the following required checks from the phase brief were
not completed and should be treated as outstanding:**
- Visual rendering at 320px / 375px / 768px / 1024px / 1440px.
- Landing page, Quick Code Lookup, known/unknown DTC result, sign-in
  handoff, consultation panel, mobile navigation — visual pass in English
  and Spanish.
- Real keyboard-only walk-through of the consultation shell (focus trap,
  Escape, restoration) — implemented per the code, not eyeballed live.
- Console-error / hydration-error check on the new landing hero.

**Recommendation**: run `npm run dev` locally (or use a working Browser
pane session) and step through the checklist above before this phase is
considered fully done. Type-checking, lint, and the test suite verify
*code* correctness; they do not substitute for confirming the *feature*
renders and behaves as intended.

## Known gaps (non-blocking, documented for Phase 2 / follow-up)

1. No browser-based UI verification (above) — the single largest gap.
2. Non-live locale catalogs (9 of 12) carry English placeholder text for
   the new Phase 1 namespaces — inert since those locales aren't routable.
3. No per-page `DtcTechnicianContext` wiring yet — shell is context-free
   everywhere it's mounted.
4. No dedicated per-IP rate limiter on the intake conversation's
   non-lookup steps (bounded by the state machine's own depth instead).
5. Vehicle year/make/model parsing in the intake engine is a simple
   heuristic, not a real vehicle-data lookup.
