# Diagnostic Consultation UX

The persistent `DtcTechnicianShell` (Slice 5) — the first modal/dialog
pattern in this codebase, mounted globally in both root layouts
(`src/app/(app)/layout.tsx`, `src/app/[locale]/layout.tsx`).

## Desktop / mobile — one component, CSS-only

No separate mobile implementation. The panel is:
- **Mobile** (base classes): `fixed inset-x-0 bottom-0 max-h-[85vh] rounded-t-xl` — a bottom sheet.
- **Desktop** (`sm:` breakpoint): `sm:inset-y-0 sm:right-0 sm:w-full sm:max-w-md` — a right-side drawer.

A semi-transparent backdrop (`bg-black/50`) sits behind the panel and
closes it on click.

## Accessibility

- `role="dialog"` `aria-modal="true"` on the panel, labeled via
  `aria-label` combining the title and subtitle.
- **Focus trap**: on open, focus moves to the panel's first focusable
  element; Tab/Shift+Tab cycle within the panel only (implemented by
  querying focusable descendants and redirecting focus at the first/last
  element boundary).
- **Escape** closes the panel from anywhere inside it.
- **Focus restoration**: closing returns focus to whatever element was
  focused before the panel opened (typically the floating trigger button).
- Trigger button: `aria-haspopup="dialog"`, `aria-expanded`, and a
  descriptive `aria-label` ("Open DTC Technician consultation").
- Messages list: `aria-live="polite"` so streamed responses are announced.
- Errors: `role="alert"`.
- All interactive targets are `min-h-11` (44px) — consistent with the
  pre-existing convention (`SiteNav`, `HeroSearch`, etc.).
- Disabled future-feature buttons use `aria-disabled="true"` with a
  descriptive `title` tooltip ("Guided Diagnosis is coming soon.") rather
  than silently doing nothing on click.

## Excluded routes

`DtcTechnicianShell` renders `null` on:
- `/admin/**` — an internal/operational area, not a customer consultation surface.
- `/account/login`, `/account/forgot-password`, `/account/reset-password`, `/account/auth/**` — auth forms, where a competing floating panel would be confusing.

Matches the phase brief's "do not display on admin-only pages" / "over
authentication forms if it creates confusion" guidance. Not excluded from
checkout, since this app has no in-page checkout form (Creem checkout is a
redirect, not an embedded page).

## Context readiness (placeholder, not full integration)

`DtcTechnicianContext` (`src/lib/dtc-technician/context.ts`) is the
interface the shell accepts today:

```ts
interface DtcTechnicianContext {
  caseId?: string;
  vehicle?: { year?, make?, model?, engine?, vin? };
  dtcCodes: string[];
  symptoms?: string;
  complaint?: string;
  scanSummary?: { moduleCount?, dtcCount?, priorityFindings? };
  workflowState?: { workflowId?, currentNodeId? };
  locale: string;
}
```

**Current use**: display only — a context pill (first DTC code + vehicle
make/model) in the panel header, and pre-filled quick-action prompts
("Explain P0303", "What should I test first for P0303?"). It is **not**
wired into the actual `/api/ai/assistant` request body — that endpoint has
no vehicle/case-context parameters yet. Threading real case-aware reasoning
through this interface is explicit Phase 2 scope.

Today the shell is mounted globally with **no** context prop passed (every
page gets the same context-free instance) — per-page context wiring (e.g.
the DTC result page passing its own code, or the case page passing its
`caseId`) is a natural, low-risk follow-up once the interface above is
validated, not done in this pass.

## Quick actions

| Action | Status |
|---|---|
| Ask a diagnostic question (composer) | ✅ functional — real request to `/api/ai/assistant` |
| Explain this code | ✅ functional (only shown when `context.dtcCodes[0]` exists) |
| What should I test first? | ✅ functional |
| Import Vehicle Scan | ✅ functional — navigates to `/diagnostics/upload` |
| Start Guided Diagnosis | ⛔ disabled preview — feature doesn't exist yet |
| Save to Diagnostic Case | ⛔ disabled preview — feature doesn't exist yet |
| Resume Diagnostic Case | ✅ functional when `context.caseId` is present |
| View Consultation History | ✅ functional — links to `/history` |

## Entitlement enforcement

The shell's composer calls the **exact same** `/api/ai/assistant` endpoint
the full `/ai-assistant` page uses — same server-side plan resolution,
same `recordAiDiagnosticUsage` quota enforcement, same 429 response shape
on an exhausted Free allowance. There is no separate, weaker enforcement
path for the shell; a Free user's first message simply surfaces the normal
upgrade-required error, shown as a plain error message with no fabricated
response.

## Known limitations

- No per-page context wiring yet (see above) — every page gets an
  identical, context-free shell instance in this pass.
- No `Save to Diagnostic Case` / `Guided Diagnosis` real functionality —
  intentionally scaffolded-and-disabled per the phase brief.
- Browser-based manual verification (desktop drawer / mobile bottom sheet
  rendering, keyboard interaction, focus restoration) could not be
  completed in this session — the Browser pane did not render in this
  environment (see docs/PHASE_1_QA_REPORT.md). Recommend a manual pass.
