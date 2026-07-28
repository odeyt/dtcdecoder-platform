# Phase 2 — Post-Merge Production Smoke Test (Disabled Rollout)

Performed against the real live production domain (`https://dtcdecoder.com`), on the deployment
built from `main` at `ba55d8f` (the just-merged commit), immediately after the merge and Vercel's
resulting auto-deploy (`vercel ls` confirmed a new `Production` deployment reach `Ready` status).

## Landing page and console health

- Landing page (`/`) loads correctly, full hero content renders, zero console errors.
- Product-features section, PDF/YouTube links, newsletter form, pricing teaser, and full footer
  (legal links, product/company nav) all render — no hydration failures, no missing chunks.

## Guided Diagnosis correctly stays locked (the actual point of this smoke test)

Reading the full accessibility tree (not just the visible interactive-element list, which
initially missed it) found:

```
button "Guided Diagnosis is coming soon." [ref_34] type="button"
```

This confirms `DIAGNOSTIC_ENGINE_ROLLOUT_TIER=disabled` (set in Step 7) is taking effect correctly
in the live deployment — the button renders in its locked, pre-Phase-2 "coming soon" state, not as
an active entry point. Clicking it was confirmed genuinely inert: zero console errors and **zero
network requests** recorded afterward (checked via `read_network_requests` filtered to `api`) —
no `/api/diagnostic-engine/*` call fires, no case gets created, nothing is silently triggered.

## Deterministic DTC lookup unaffected

Navigated to `/dtc/P0420` — the existing deterministic lookup renders the full structured page
(category, drive recommendation, likely causes, symptoms, recommended checks, FAQ) exactly as
before the merge, zero console errors. Confirms the pre-existing DTC lookup feature is untouched by
this release.

## What this does and does not prove

This confirms the master rollout gate (`isDiagnosticEngineRolloutAllowed`) is correctly wired end
to end in the real deployed app — not just in unit tests. It does not exercise a signed-in
internal-tester session (that requires real authentication, out of scope for an anonymous smoke
test) — that's the next step, once/if `DIAGNOSTIC_ENGINE_ROLLOUT_TIER` is changed to
`internal_only` with explicit approval, which has not happened and is not requested here.

## Result

Post-merge production smoke test passes. The Diagnostic Engine is live in the codebase but fully
inert and unreachable for every visitor, matching the intended first-deployment state.
