# Typography System

Modernization pass over DTCDecoder's typography (branch
`feature/chatgpt-style-typography`) — clean, readable, ChatGPT-adjacent type
quality while preserving the dark theme, automotive red accents, layout,
functionality, and accessibility. No proprietary UI assets were copied;
only general typography *qualities* (readability, hierarchy, spacing) were
targeted.

## Font family

**Already Geist** — this codebase adopted `next/font/google`'s `Geist` /
`Geist_Mono` before this pass (both root layouts,
`src/app/[locale]/layout.tsx` and `src/app/(app)/layout.tsx`). No font
change was needed; this pass only standardizes how the existing font is
used.

```
Sans:  Geist, "Geist Fallback", ui-sans-serif, -apple-system,
       BlinkMacSystemFont, "Segoe UI", sans-serif
Mono:  Geist Mono, ui-monospace, SFMono-Regular, Menlo, Monaco,
       Consolas, "Liberation Mono", monospace
```

Wired via CSS variables (`--font-geist-sans` / `--font-geist-mono`, set by
`next/font`) into Tailwind's `--font-sans` / `--font-mono` theme tokens
(`src/app/globals.css`'s `@theme inline` block). No font files are
committed — `next/font` handles self-hosting and preloading automatically,
with zero layout shift.

Weights loaded: only what Geist's variable font naturally provides through
normal CSS `font-weight` values (400/600/650/700) — no extra weight files
requested.

## Text color tokens

Unchanged — already close to the brief's target values before this pass:

| Token | Value | Use |
|---|---|---|
| `--text-primary` | `#f5f3f1` | headings, primary content (near-white, not pure `#fff`) |
| `--text-secondary` | `#a8a6ad` | body copy |
| `--text-muted` | `#6f6d75` | meta text, captions |
| `--accent-red` | `#e11d2e` | links, CTAs, true warnings — never used for normal headings |

## Body baseline

```css
body {
  font-size: 16px;
  line-height: 1.65;
}
.text-small { font-size: 14px; line-height: 1.5; }
.text-lead  { font-size: 18px; line-height: 1.65; }
```

## Heading scale (inside `.prose-diagnostic`)

| Level | Mobile | Desktop (≥640px) | Line-height | Weight | Letter-spacing |
|---|---|---|---|---|---|
| h1 | 30px | 40px | 1.15 | 700 | -0.02em |
| h2 | 26px | 30px | 1.2 | 700 | -0.015em |
| h3 | 22px | — | 1.3 | 650 | — |
| h4 | 19px | — | 1.4 | 600 | — |

Heavy weights (800/900) are never used for headings — reserved for rare
marketing emphasis only, and not used anywhere in this pass.

## The `.prose-diagnostic` class

The canonical long-form typography container (`src/app/globals.css`).
Covers: `h1`–`h4`, `p`, `ul`/`ol` (including nested lists), `strong`, `em`,
`blockquote`, `code`, `pre`, `hr`, `table`, `a`. Max content width: `74ch`
(within the brief's 70–78ch target) — this constrains only the prose
container itself, never the page's outer `.container-app` shell.

**Where it's applied**: all 11 legal/policy pages (terms, privacy,
privacy-rights, cookies, dmca, dpa, acceptable-use, ai-disclaimer, refund,
affiliate-disclosure, subscription-billing) and the FAQ page. These
previously repeated the same four hardcoded utility classes on every
single heading/paragraph/list (`text-zinc-300`, `text-white`,
`mt-10 text-xl font-bold text-white`, `mt-4 list-disc space-y-2 pl-5`) —
disconnected from the app's own `--text-primary`/`--text-secondary` design
tokens. They now use bare semantic tags (`<h1>`, `<h2>`, `<p>`, `<ul>`)
inside a `.prose-diagnostic` wrapper, which supplies consistent spacing,
color, and hierarchy from one place instead of dozens of repeated
per-element classes.

**Where it was deliberately NOT applied**: the Diagnostic Workbench
(ranked causes, test plan, technician notes), DTC result page sections,
and pricing cards. These are compact, structured UI (cards, badges,
data-lists) rather than sustained prose — forcing the 70ch/heading-scale
prose treatment onto them would be a real redesign of working, recently-
built, thoroughly-tested surfaces, which the brief explicitly said not to
do ("do not redesign unrelated page structures"). Their existing
Tailwind-utility-per-element styling already uses the correct color tokens
consistently.

`.blog-content` (the pre-existing blog-post prose class) is left as-is,
unmodified — it already worked correctly and migrating it wasn't necessary
for any of the brief's named target areas.

## Markdown / long-form content renderer

**Audited, not present where assumed.** `marked` (the only markdown
parser in this codebase) is used exclusively by the blog renderer
(`src/app/[locale]/blog/[slug]/page.tsx`). The DTC Technician chat
(`DtcTechnicianShell.tsx`) renders assistant responses as **plain text**
(`whitespace-pre-wrap`, no HTML, no markdown parsing) — there was no
markdown renderer to "fix" there. Diagnostic reports / scan analysis
content is **not markdown at all** — it's structured JSON
(`DiagnosticAiOutputSchema`: `summary`, `rankedCauses[]`,
`recommendedTests[]`, `safetyWarnings[]`, `missingInformation[]`) rendered
through dedicated React components (`LikelyCausesSection`,
`TestPlanSection`, etc.), never through a generic prose/markdown pipeline.

This pass did not add a markdown parser to the chat (out of scope for a
typography-only change, and would need its own sanitization review) —
instead, the existing plain-text chat bubble got a line-height refinement
(`leading-relaxed`) for readability, with no change to how it's rendered
or sanitized.

## DTC codes, VINs, and technical values

A lightweight companion class, `.tech-value`, was added for a single
inline technical token in a sentence (monospace, slightly smaller,
primary-text color) — a lighter-weight sibling to the full `code`
treatment inside `.prose-diagnostic`. DTC codes on the DTC result page
(`DtcCodeResult.tsx`) and technical-details table already used `font-mono`
consistently before this pass; no change was needed there.

## Code blocks (`.prose-diagnostic pre` / `code`)

- Inline `code`: mono font, `rgba(255,255,255,0.08)` background, small
  radius, `0.875em` size.
- Fenced `pre`: mono font, `var(--surface-2)` background (lighter than
  page background), `1px solid var(--border-subtle)` border, rounded
  corners, `1rem` padding, `overflow-x: auto` (never clips, always
  scrolls horizontally), `1.6` line-height.

## Tables

`.prose-diagnostic table` uses `display: block; overflow-x: auto` so a
wide table scrolls within its own box rather than breaking the page's
layout — the brief's "no horizontal overflow" requirement.

## Buttons and forms

Audited, not changed — already compliant:
- Buttons: `font-semibold` (600) at 14–16px, `min-h-11` (44px) touch
  targets, used consistently across pricing/account/CTA buttons already.
- Form inputs: `min-h-11`, `placeholder:text-[var(--text-muted)]` (muted,
  distinct from label/value color), errors rendered as
  `text-[var(--accent-red)]` text (never color-only — the error message
  text itself conveys the problem).

## Mobile rules

- `.prose-diagnostic` headings default to mobile sizes; the `≥640px`
  media query bumps h1/h2 to their desktop sizes.
- All legal/FAQ pages verified at 1440×900, 768×1024, and 390×844 with no
  horizontal overflow, no clipped headings, and no console errors (see
  Testing below).

## Accessibility

- No color changes — contrast ratios are unchanged from the
  already-passing existing tokens.
- Heading hierarchy: legal/FAQ pages verified programmatically to never
  skip a level (h1 → h2, no h1 → h3).
- Bare semantic tags (`<h1>`, `<h2>`, `<ul>`, `<ol>`) replace the previous
  per-element utility-class styling — screen readers get real heading/list
  semantics either way, but the new markup is simpler and less error-prone.
- Reduced-motion handling (pre-existing sitewide rule) is untouched.
- No base font size was reduced below 16px anywhere.

## Correct usage

```tsx
// A new long-form page (legal, FAQ, help, or similar sustained prose):
<div className="prose-diagnostic mx-auto px-6 py-16">
  <h1>Page Title</h1>
  <p>Body copy...</p>
  <h2>A Section</h2>
  <ul>
    <li>Item</li>
  </ul>
</div>
```

## Anti-patterns (what this pass removed)

```tsx
// OLD — repeated, disconnected from design tokens, inconsistent:
<div className="mx-auto max-w-2xl px-6 py-16 text-zinc-300">
  <h1 className="text-3xl font-bold text-white">Title</h1>
  <h2 className="mt-10 text-xl font-bold text-white">Section</h2>
  <p className="mt-4">Body copy...</p>
  <ul className="mt-4 list-disc space-y-2 pl-5">...</ul>
</div>
```

Don't hand-repeat heading/paragraph/list utility classes on every element
of a long-form page — wrap it in `.prose-diagnostic` and use bare semantic
tags instead.
