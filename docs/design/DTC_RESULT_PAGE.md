# DTC Result Page

The public `/dtc/[code]` result page (`src/components/DtcCodeResult.tsx`).

## The constraint that shapes this page

`DtcCode` (`src/lib/types.ts`) stores diagnostic content as flat strings:

```ts
symptoms: string[];
causes: string[];            // ordered, most common first
diagnostic_steps: string[];  // one sentence per step
common_mistakes: string | null;  // one prose block
```

There is **no** stored reasoning, confidence level, evidence match, required
tool, test condition, expected value, interpretation, or next action.

So this page does not show any. A "Why it ranks first" line or an
"Expected: 12.6 V" reading would have to be generated in the frontend, and
fabricated diagnostic advice is worse than no advice — a technician acting
on an invented specification can damage a vehicle or mis-diagnose a fault.
Every component below is built to accept that data later without a rewrite;
none of it invents the data now.

## Widths

Three measures, defined in `globals.css`:

| Class | Width | Used for |
|---|---|---|
| `.container-app` | 1360px | app shell — dashboards, pricing grids |
| `.container-report` | 1140px | the result page itself; structured rows and panels |
| `.report-measure` | 74ch | running prose and lists inside a section |

The page previously used `.container-app`, so a one-line cause was stretched
across 1360px inside a full glass panel. That is what made short content read
as an empty card.

Tables, the conversion panel's two-column grid, and anything needing real
horizontal room stay at `.container-report` and must **not** be wrapped in
`.report-measure`.

Spacing: `space-y-12` between major sections (48px), `p-3`–`p-3.5` inside
compact rows, `space-y-2` between list items.

## Components

### `RankedCauseList`

Compact ranked rows over `causes: string[]`.

- Rank renders as literal `#N` text — never colour or badge alone.
- `#1` additionally gets a `MOST LIKELY` badge and a `glass-panel` surface;
  lower ranks get a hairline border only, so the eye lands on the primary
  answer without the row growing taller.
- Semantic `<ol>`.
- `RankedCauseItem.detail` accepts arbitrary content beneath the cause text —
  the extension point for Phase 2.

Replaces `CauseCard`, which gave every one-line cause a full panel.

### `DiagnosticStepList`

Numbered workflow over `diagnostic_steps: string[]`.

- Step number is real text (not a CSS counter), so it survives copy, print,
  and screen readers. A visually hidden `Step N:` prefix precedes the text.
- Semantic `<ol>`.
- `DiagnosticStepItem.detail` is the Phase 2 extension point.

### Do-not-replace panel

Heading is **"Do not replace these parts yet"**. `common_mistakes` is a
single prose string, so it renders as one amber caution panel at
`.report-measure`. It is *not* split into per-part decision rules — that
would mean parsing text with no guaranteed structure.

### `ProfessionalReportUpsell`

One conversion panel. It replaced a `LockedResultPanel` rendering the full
`LOCKED_SECTION_CATALOG`: **nine placeholder cards, each with skeleton lines
and its own "Upgrade" button**. Nine near-identical CTAs beneath grey
skeleton rows read as content that failed to load, not as an offer.

The panel contains:

- Heading: *Complete the diagnosis with DTC Technician*
- Two columns: what the free result already included, what the report adds
- **One** primary CTA — `One Professional Diagnostic Report — $6.99`
- **One** secondary CTA — `View Pro Technician plans`
- *One-time payment. No subscription required.*

Billing is not reimplemented:

| Concern | Source |
|---|---|
| Price | `PROFESSIONAL_REPORT_ONE_TIME.priceUsd` via `formatPrice` |
| Product name | `PROFESSIONAL_REPORT_ONE_TIME.name` |
| Checkout | `POST /api/checkout/single-report` |
| Anonymous resume | `/account/login?next=/pricing?start_checkout=<key>` |

The anonymous path deliberately hands off to `/pricing`, where
`OneTimeReportCard` already auto-resumes this exact checkout after sign-in,
rather than duplicating that logic here. Entitlements, report-credit
consumption, and the price itself are untouched.

## Terminology

`Unlock Full AI Diagnosis` → `Complete the diagnosis with DTC Technician`.
`Run Full AI Diagnosis` → `Start a DTC Technician diagnosis`. Product
surfaces use *DTC Technician*, *Professional Diagnostic Report*, *diagnostic
workflow*. Legal and automated-system disclosures are unchanged.

Copy in the new components is hardcoded English, matching the existing
convention in this component (the previous "Unlock Full AI Diagnosis" block
was too). Locale files are not touched, so the catalog-parity test across the
12 locales still holds.

## Analytics

Three events, registered in `src/lib/analytics/events.ts`:

- `professional_report_upsell_viewed`
- `professional_report_cta_clicked`
- `pro_plan_cta_clicked`

No metadata is attached — no DTC code, symptoms, plan, or identifiers.

## Accessibility

- Rank and step numbers are text, never colour/badge alone.
- `<ol>` for both ranked causes and workflow steps.
- Panel is `aria-labelledby` its heading; checkout errors use `role="alert"`.
- All CTAs are ≥44px tall with visible `focus-visible` outlines.
- The skeleton rows that previously implied loading state are gone.

## Compatibility

No schema change. `DtcCode` is untouched, so every existing published record
renders unchanged. Empty `causes`/`diagnostic_steps` arrays render nothing
rather than an empty container; a null `common_mistakes` omits the panel.

## Test coverage

`test/dtc-result-page-redesign.test.tsx` — 17 tests: rank rendering, single
`MOST LIKELY`, verbatim cause/step text, `<ol>` semantics, empty-input
safety, DTC Technician terminology, absence of `Unlock Full AI Diagnosis`,
canonical price and product name, exactly one primary and one secondary CTA,
no repeated Upgrade buttons, every `LOCKED_SECTION_CATALOG` title absent,
anonymous sign-in resume, and the ARIA label.

---

## Phase 2 — Structured Diagnostic Data Model

**Not implemented in this branch.** A future migration may add optional
fields; the components above already accept them via their `detail` slots.

```ts
type RankedCause = {
  title: string;
  reasoning?: string;         // why it ranks where it does
  confirmationTest?: string;  // the single test that confirms it
  confidence?: "high" | "moderate" | "lower";
};

type DiagnosticStep = {
  title: string;
  tool?: string;
  conditions?: string;
  check: string;
  expectedResult?: string;
  interpretation?: string[];
  nextAction?: string;
};

type DoNotReplaceItem = {
  component: string;
  reason: string;
  replaceOnlyIf: string;
};
```

Two rules carry forward. Fields stay optional so existing records keep
rendering. And expected values must be authored per make/model/engine or
omitted — a generic "should read 12.6 V" across every vehicle is the same
fabrication problem in a different place.
