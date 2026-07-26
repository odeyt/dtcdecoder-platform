# Multilingual QA Report

Date: 2026-07-26. Deployed to production (dtcdecoder.com) from `main`.

## 1. Languages added

12 live locales: `en` (canonical), `es`, `fr`, `th`, `lo`, `vi`, `km`,
`zh-CN`, `pt-BR`, `de`, `ja`, `ko`. Menu order: English, Français, ไทย, ລາວ,
Tiếng Việt, ខ្មែរ, Español, 中文, Português (Brasil), Deutsch, 日本語, 한국어.
`pt-BR` is distinct from generic `pt`; `zh-CN` is Simplified.

## 2. Translation coverage by locale

Every non-English catalog is a full 216-key parity mirror of `en.json` (16
namespaces), CI-enforced. **All are AI-translated BETA — none human-reviewed.**
Lao and Khmer are lowest-confidence (low-resource) and need native review.

## 3. Landing-page coverage

Header/nav, hero (headline, sub, placeholder, CTAs, trust line), value props,
PDF/video/pricing sections, footer, email signup — fully catalog-driven in all
12. Verified translated heroes rendering for fr/th/lo/vi/km/de/ja/ko/zh-CN/
pt-BR/es on production.

## 4. Application-page coverage

Catalog-driven surfaces (nav, pricing, account, preferences, AI assistant,
history, DTC search/result chrome, errors, empty states) translated in all 12.
**Gap:** the hardcoded legal/policy pages are bilingual EN/ES only (faq,
refund, cookies, ai-disclaimer, acceptable-use); the rest are English-only and
fall back to English in other languages. DTC/blog article **bodies** are
English-only (no per-locale content table).

## 5. DTC report localization behavior

Pipeline exists and is wired (see TRANSLATION_PROVIDER_ARCHITECTURE.md):
canonical English first, then glossary-protected translation of the fixed
text; technical tokens preserved; entitlement- and `ai_output_enabled`-gated.
**Report output is currently offered in English + Spanish only** — extending to
beta locales is a pending safety-sensitive decision. UI localization is
independent and live in all 12.

## 6. Thai verification

- `/th` renders Thai hero/nav; `<html lang="th">`; button label ไทย.
- Technical acronym **DTC preserved** in Thai nav ("ค้นหารหัส DTC").
- Menu shows ไทย as native name with active check mark.
- Mobile (375px) audited: no horizontal overflow on the Thai home page; the
  language switcher is present and usable in the mobile menu.
- Not yet verified by a native speaker; PDF/report glyph rendering not yet
  audited (report output stays EN/ES for now).

## 7. SEO status by locale

Per-locale `<title>`, `<meta description>`, and Open Graph are wired via each
content page's `generateMetadata` (reads the `meta` catalog namespace) and are
LIVE — verified localized titles for fr/de/ja/zh-CN on production. `en` is
x-default and SEO-enabled. **All beta locales have `seo_enabled=false`** —
`buildLocaleAlternates` emits hreflang only for enabled+seo_enabled locales, so
beta translations are NOT indexed until human review. Flip per-locale
`seo_enabled=true` after review (start with es). Static generation preserved
(`generateStaticParams` pre-renders `en`; others render dynamically).

## 8. Tests run

`npx vitest run` → **221 passed** (30 files), including:
- `test/catalog-parity.test.ts` — key parity across all 11 non-English catalogs.
- `test/locale-codes.test.ts` — live/recognized gating, pt-BR ≠ pt, region-code
  case handling.
- `test/language-menu.test.ts` — English first-visit default, all 12 in order,
  native names (Thai=ไทย, zh-CN=中文, pt-BR=Português (Brasil)…), no generic pt.
- `test/localized-href.test.ts` — locale switch preserves the current page:
  content routes prefixed, (app)-shell/external/default hrefs untouched, no
  double-prefixing.
Missing-key fallback relies on next-intl runtime behavior (not unit-tested).

## 9. Build status

`npm run build` → success. `npx tsc --noEmit` → clean. `npm run lint` → clean.

## 10. Files changed (high level)

`messages/{es,fr,th,lo,vi,km,zh-CN,pt-BR,de,ja,ko}.json` (new catalogs),
`src/lib/i18n/locale-codes.ts` (registry, LIVE_LOCALES, menu order,
getMenuLocales, live-set case fix), `src/components/LanguageSwitcher.tsx`
(premium selector), `src/components/SiteNav.tsx` + `SiteFooter.tsx`
(locale-aware links), `src/app/(app)/layout.tsx` (locale-aware shell),
`src/lib/i18n/localized-href.ts`, several `(app)` legal pages (EN/ES),
`test/{catalog-parity,locale-codes}.test.ts`, docs.

## 11. Migration details

- `0018_enable_beta_locales.sql` — enables es/fr/th/lo/vi/km (beta:
  in_review, seo_enabled=false, tier 3). **Applied.**
- `0019_enable_more_beta_locales.sql` — INSERTs pt-BR row + enables
  zh-CN/pt-BR/de/ja/ko (same beta posture). **Applied.**
- `0017_publish_spanish.sql` — superseded by 0018; do not run.
- None set `ai_output_enabled` for new locales (report output stays EN/ES).

## 12. Commit hash

Latest: `9c9e2c5` (12-language catalogs) on `main`, deployed. Preceding
multilingual commits: 24322b5, 3cc8de6, 63e5036, plus 0018/0019 migration
commits.

## 13. Remaining human-review requirements

- Native linguistic review of all 11 non-English catalogs (Lao/Khmer highest
  priority) before any locale is called "verified" or SEO-indexed.
- Legal-text review before those pages are translated beyond EN/ES.
- Safety review before enabling report output in beta locales.

## 14. Deployment status

**Deployed and live** on dtcdecoder.com: 12-language UI (content tree + app
shell + premium selector), locale gating, per-locale SEO titles/descriptions/OG,
and beta DB flags applied. Mobile (375px) overflow checks passed (Thai, German).
NOT done: report output in new locales (safety decision pending), remaining
legal-page translations (legal-review-sensitive), flipping `seo_enabled` after
review, and a broader 320/768/1024/1440px visual sweep + native linguistic
review.
