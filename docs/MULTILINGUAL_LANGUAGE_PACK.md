# Multilingual Language Pack — Status

Last updated: 2026-07-26. Branch: `feat/multilingual-9-locales`.

## Languages live in the selector

Generated from `LANGUAGE_MENU_ORDER` + `getMenuLocales()` (filtered to
`LIVE_LOCALES`). Display order and native labels:

| # | Locale | Native label | UI catalog | Verification |
|---|--------|--------------|-----------|--------------|
| 1 | `en` | English | ✅ canonical | Source of truth |
| 2 | `fr` | Français | ✅ full | **beta — AI-translated, not human-reviewed** |
| 3 | `th` | ไทย | ✅ full | **beta — AI-translated, not human-reviewed** |
| 4 | `lo` | ລາວ | ✅ full | **beta — AI-translated, low-resource, needs native review** |
| 5 | `vi` | Tiếng Việt | ✅ full | **beta — AI-translated, not human-reviewed** |
| 6 | `km` | ខ្មែរ | ✅ full | **beta — AI-translated, low-resource, needs native review** |
| 7 | `es` | Español | ✅ full | **beta — AI-translated, not human-reviewed** |
| 8 | `zh-CN` | 中文 | ✅ full | **beta — AI-translated, not human-reviewed** |
| 9 | `pt-BR` | Português (Brasil) | ✅ full | **beta — AI-translated, not human-reviewed** |
| 10 | `de` | Deutsch | ✅ full | **beta — AI-translated, not human-reviewed** |
| 11 | `ja` | 日本語 | ✅ full | **beta — AI-translated, not human-reviewed** |
| 12 | `ko` | 한국어 | ✅ full | **beta — AI-translated, not human-reviewed** |

All twelve spec languages now have full key-parity catalogs and appear in the
selector. `pt-BR` is a distinct locale (never generic `pt`); `zh-CN` is
Simplified (never Traditional). None is human-reviewed.

App-shell activation: `es/fr/th/lo/vi/km` via migration `0018`; `zh-CN/pt-BR/
de/ja/ko` via migration `0019` (pt-BR needs a new registry row). Run both in
the Supabase SQL Editor.

## Coverage per locale

Each live catalog is a full key-parity mirror of `messages/en.json` (16
namespaces: nav, footer, hero, home, common, auth, pricing, account,
preferences, dtcResult, dtcSearch, dtcError, emailSignup, aiAssistant,
history, meta). Parity is enforced by `test/catalog-parity.test.ts` (CI fails
on any missing/extra key).

**This covers the public landing + navigation + pricing + account/app *chrome*
(labels, buttons, headings, errors, empty states).** It does NOT yet cover:

- The hardcoded legal/policy pages beyond the five already bilingual
  (faq, refund, cookies, ai-disclaimer, acceptable-use are EN/ES only — other
  languages fall back to English there).
- **DTC descriptions and blog article BODIES** — these are English-only in the
  DB (no per-locale content table exists yet). Only the surrounding UI is
  localized; the `dtcResult.contentNotLocalizedNote` string discloses this.

## Behavior

- English is the default for every first-time visitor; no IP/geo or forced
  browser-language switching.
- Public content tree (`/`, `/dtc`, `/blog`, `/[make]/[slug]`) is locale-
  prefixed: English unprefixed, others `/<locale>/...`. Unbuilt recognized
  locales 307-redirect to English (proxy).
- The `(app)` shell (account/pricing/legal) is cookie-driven
  (`dtc_interface_locale`) and gated on the DB `languages.enabled` flag via
  `isEnabledLocale`. **App-shell rendering in fr/th/lo/vi/km/es requires the
  matching registry row to be `enabled` — see the pending migration below.**
- Missing keys fall back to English (next-intl); raw keys are never shown.
- Technical tokens (DTC, P0420, PDF, AI, USD, PCM/TCM/etc.) are preserved
  untranslated in all catalogs.

## Pending — required for full activation

1. **DB registry migration** (owner runs in Supabase SQL Editor): set
   `enabled=true` (+ `public_available`, `seo_enabled` when review is done) for
   `es, fr, th, lo, vi, km`. Until then the content tree is translated but the
   app shell stays English for these locales. (Spanish's `0017_publish_spanish`
   is also still pending.)
2. **Human linguistic review** — no live locale is human-verified. Lao and
   Khmer especially need native review before being represented as production
   quality.
3. Remaining phases from the program spec: report-language selector, provider
   interface formalization, per-locale SEO metadata + `seo_enabled`, extract
   remaining hardcoded strings, zh-CN/pt-BR/de/ja/ko catalogs, full test matrix
   + viewport checks.

## Honesty statement

No language in this pack has passed human linguistic review. All non-English
catalogs are machine/AI translations shipped as **beta**. Do not represent any
locale as "fully verified" until it has passed both automated parity checks
(done) and human review (not done).
