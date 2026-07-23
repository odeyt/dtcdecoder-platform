# Localization Architecture

How DTCDecoder's multilingual system is built: routing, message catalogs, AI
translation, terminology protection, and currency display. This is the technical
reference; see [`LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md`](LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md)
for the free/paid rules and [`LOCALIZATION_OPERATIONS.md`](LOCALIZATION_OPERATIONS.md)
for how to actually run this day to day (activating a language, editing the glossary,
setting rates, deployment/rollback).

## Two route trees, two root layouts

Next.js doesn't allow two differently-named dynamic segments (`[make]` and `[locale]`)
at the same position in the route tree, and one shared root layout can't vary
`<html lang/dir>` for one subtree while staying fixed for another. The app is split:

- **`src/app/[locale]/`** — public, SEO-facing content: homepage, `/dtc`,
  `/dtc/[code]`, `/[make]/[slug]`, `/blog`, `/blog/[slug]`. Own root layout
  (`src/app/[locale]/layout.tsx`) with locale-driven `<html lang>`/`dir` and a
  `NextIntlClientProvider`.
- **`src/app/(app)/`** — everything else: `account/`, `admin/`, `pricing/`,
  `ai-assistant/`, `history/`, `contact/`, `privacy/`, `terms/`,
  `affiliate-disclosure/`, `repair-pdfs/`, `videos/`. A route group, so URLs are
  unchanged (`/account` still serves at `/account`). Own root layout
  (`src/app/(app)/layout.tsx`), fixed English `<html>` shell.

`src/app/api/**` is untouched by either tree.

### Locale rewrite in `proxy.ts`

Next.js 16 renamed `middleware.ts` to `proxy.ts`, and — this matters if the project
uses a `src/app` directory — it must live at **`src/proxy.ts`**, not the repo root,
or it silently never runs.

[`src/proxy.ts`](../src/proxy.ts) rewrites (never redirects) any request whose first
path segment isn't a recognized locale code to `/en/<path>` internally. Today's bare
URLs (`/dtc/p0420`, `/land-rover/p2263`) keep resolving unchanged — English is the
unprefixed canonical/default. `(app)` routes and metadata routes (`robots.txt`,
`sitemap.xml`) are explicitly passed through and never get a locale prefix
(`APP_SHELL_TOP_LEVEL_SEGMENTS` in [`src/lib/i18n/app-shell-routes.ts`](../src/lib/i18n/app-shell-routes.ts)
is the single source of truth for that segment list, shared with
[`src/lib/reserved-slugs.ts`](../src/lib/reserved-slugs.ts)).

The rewrite and the Supabase session-cookie refresh share one `buildResponse()`
closure. This is load-bearing: a naive `NextResponse.next({request})` inside the
cookie `setAll` callback would silently discard the locale rewrite on any request that
also refreshes a session cookie (e.g. a first anonymous visit) — exactly the request
class the rewrite matters most for, since anonymous visitors are the majority of
traffic to bare DTC-code URLs.

Locale recognition uses a static, code-committed superset
([`src/lib/i18n/locale-codes.ts`](../src/lib/i18n/locale-codes.ts), 54 codes) — never
a per-request DB query — so routing stays fast and enabling a Tier-4 language later is
a pure DB change with zero code touching this file's collision guarantees.
`isReservedMakeSlug()` in `reserved-slugs.ts` rejects the full static superset (not
just currently-enabled codes), so a `dtc_codes.make` value like `"de"` can never
silently 404 the moment German is later enabled in the registry — the admin
language-enable action also checks for this collision directly (see
`updateLanguageAction` in `src/app/(app)/admin/actions/languages.ts`) before allowing
a language to be enabled.

## Message catalogs (next-intl)

[next-intl](https://next-intl.dev) handles UI chrome translation — `useTranslations`
(client / sync Server Components) and `getTranslations` (async Server Components),
plus locale-aware number/date formatting. It is used **only** for the message layer;
its own routing middleware was not adopted, since `proxy.ts` already owns locale
resolution and auth. `src/i18n/request.ts` reads the already-resolved `[locale]` route
param rather than re-deriving it.

Catalogs live in `messages/en.json` and `messages/es.json` (187 keys each, verified
for key-parity by diffing the two files' key sets after every translation pass).
Namespaces: `nav`, `footer`, `hero`, `home`, `common`, `auth`, `pricing`, `account`,
`preferences`, `dtcResult`, `dtcSearch`, `dtcError`, `emailSignup`, `aiAssistant`,
`history`, `meta`.

**Two distinct provider setups**, because the two route trees resolve locale
differently:

- `src/app/[locale]/layout.tsx` — locale comes from the URL segment. Static generation
  is preserved via `generateStaticParams` + `setRequestLocale()` called before any
  locale-dependent rendering.
- `(app)` pages that are already dynamic (account, preferences, pricing, ai-assistant,
  history) call `resolveAppShellLocale()`
  ([`src/lib/i18n/app-shell-locale.ts`](../src/lib/i18n/app-shell-locale.ts)) directly
  and wrap their own subtree in a `NextIntlClientProvider`. `resolveAppShellLocale()`
  reads `user_preferences.interface_locale` for a signed-in user with a saved
  preference, else the `dtc_interface_locale` cookie (anonymous/free "try it" language
  switching, never persisted), else falls back to English.

**This function is deliberately not called from `src/app/(app)/layout.tsx` itself** —
doing so would read `cookies()`/auth in a shared layout, forcing every currently-static
`(app)` page (`/account/login`, `/privacy`, `/terms`, `/contact`,
`/affiliate-disclosure`) into per-request dynamic rendering. Those five pages are a
deliberate, disclosed exception: **English-only**, statically generated, not wired to
next-intl at all.

### The static-generation trap

Any unset `NextIntlClientProvider` prop (`now`/`timeZone`/`formats`) or any
`useTranslations()` call without a prior `setRequestLocale()` triggers next-intl's
internal `getConfig()`, which falls back to reading `next/headers()` — and that forces
the *entire* route tree into dynamic rendering, silently regressing static generation
with no build error. Every async page under `[locale]/` calls `setRequestLocale()`
before any translation call; every `NextIntlClientProvider` instance passes explicit
`now`/`timeZone`/`formats`. Verify this hasn't regressed by checking `npm run build`'s
route table after any i18n-adjacent change — `[locale]` root paths using
`generateStaticParams` should stay `●` (SSG); everything genuinely dynamic should stay
`ƒ`. This exact regression has happened before in this project and is easy to
reintroduce without noticing, since the app still works locally — it only shows up as
"why did every route become dynamic" in the build output.

## AI diagnostic translation

The AI assistant ([`src/lib/ai/assistant.ts`](../src/lib/ai/assistant.ts)) always
generates the diagnostic answer in English first (`streamAssistantResponse`), for
every user, regardless of preferred output language. If the request's `outputLocale`
is set and non-English, a **second, separate, low-effort Claude call**
(`translateDiagnosticText`) translates that fixed English text.

This split — never generating directly in the target language — is what keeps a
canonical diagnostic record from drifting between languages. Generating independently
per language risks two users on the same code/vehicle getting diagnoses that reach
different conclusions or rank causes differently, purely as an artifact of which
language they asked in. Translating a fixed text guarantees the substance is
identical; only the words differ.

`translateDiagnosticText`'s system prompt (`buildTranslationSystemPrompt`) is explicit
and non-negotiable about what must survive verbatim: DTC codes, VINs, part numbers,
connector/pin names, wire colors, CAN High/CAN Low/LIN/FlexRay/MOST, voltages,
resistance/pressure/torque/temperature values *and* their units, module acronyms
(PCM, ECU, ABS, etc.), calibration IDs, TSB numbers. It also forbids adding, removing,
reinterpreting, or reordering diagnostic content — this is a translation task, not a
new diagnosis.

Token usage from **both** calls (English generation + translation) is summed and
counted against the user's rate limit — a non-English query costs more tokens than an
English one, and that cost is real and charged, not absorbed silently.

`search_history.ai_canonical_response_en` / `ai_translated_response` are populated by
an UPDATE after the response stream closes, so translation never blocks
time-to-first-byte on the live chat.

### Saved reports (`diagnostic_reports` / `diagnostic_report_localizations`)

Saving a report is an explicit, paid, deliberate user action
(`saveDiagnosticReportAction`) — not automatic per chat turn (most chat turns are
exploratory, not worth persisting). It copies the *already-computed* canonical English
text and translation from `search_history` into `diagnostic_reports` /
`diagnostic_report_localizations` with **zero additional generation calls** — so a
saved report can never drift from what the user actually saw in the live chat.

## Terminology protection (`terminology_glossary`)

Per-locale approved terms, injected into the translation system prompt
(`listGlossaryForLocale` in [`src/lib/i18n/languages.ts`](../src/lib/i18n/languages.ts),
only `reviewed`/`approved` rows). Each entry marks `do_not_translate` (keep the English
term verbatim — used for acronyms like PCM/DTC/ECU) or a specific `translated_term`
(e.g. "Check Engine Light" → "Luz de Revisar Motor (Check Engine)"). Service-role only
— never exposed via a public Supabase policy, since it's an internal quality-control
mechanism, not user-facing data.

## Language registry & support tiers

[`languages`](../supabase/migrations/0006_i18n_registry.sql) is the single source of
truth for which of the 54 registered locales are actually live, and how live. A
four-column set of independent booleans/tiers controls activation granularly, without
code changes:

| Field | Meaning |
|---|---|
| `enabled` | Language exists/selectable at all (interface language) |
| `public_available` | SEO/anonymous-visitor visible, vs. paid-preview only |
| `paid_only` | Gates via `src/lib/i18n/entitlements.ts`, not this flag directly |
| `support_tier` | 1 fully verified, 2 AI-supported, 3 experimental, 4 disabled/registered |
| `ai_output_enabled` | Eligible for AI diagnostic output translation |
| `bilingual_enabled` / `multilingual_enabled` | Eligible as a secondary report language |
| `safety_review_status` | `not_reviewed` / `in_review` / `approved` / `rejected` |
| `seo_enabled` | Included in `hreflang`/sitemap alternates — gates indexing independent of AI/UI readiness |

RLS on `languages`/`currencies`/`currency_rates` is public **read** on the *full*
table (`using (true)`, not `enabled = true`) — the account preferences UI needs to
render locked/disabled rows too ("Spanish — Pro only", "French — coming soon"), not
just the active subset. Callers filter to the subset that matters for their surface
(`buildLocaleAlternates` filters to `enabled && seo_enabled`; the proxy/sitemap use the
static locale-codes superset for routing). All writes to these tables go through
admin Server Actions using the service-role client — no client-side insert/update
policy exists on any of them.

## Currency display

[`src/lib/currency.ts`](../src/lib/currency.ts) — **display estimates only**, never
used for actual checkout or settlement. Creem always bills in USD regardless of what a
user sees displayed; `currency_rates` holds static, admin-entered rates (no live FX
fetching). `getDisplayPriceEstimate()` is the one function pages call: it resolves the
real rate (or the lack of one), converts with a single multiply-then-round at the
target currency's own `decimal_places` (correctly collapsing to whole units for
zero-decimal currencies like JPY/KRW/VND/CLP/HUF), and returns enough information
(`isEstimate`, `rateSource`, `rateEffectiveAt`) to render the required "Estimated
display price" / "Checkout will be charged in USD" disclosure honestly. A missing or
expired rate always falls back to showing the USD price unmodified — never a stale or
fabricated number.

## Entitlements

See [`LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md`](LANGUAGE_AND_CURRENCY_ENTITLEMENTS.md)
for the full free/pro/workshop matrix. The short version:
[`src/lib/i18n/entitlements.ts`](../src/lib/i18n/entitlements.ts) is a single
config-object-style module (mirroring `src/lib/pricing.ts`'s pattern) checked both for
UI gating and, non-negotiably, at every real mutation point — preferences save
(`savePreferencesAction`), the AI route's `outputLocale` handling, and report save. A
disabled `<option>` in a form is not enforcement; every server action that touches a
gated field re-validates the submitted value against the real entitlement and the
real registry state.

## Known limitations / explicitly out of scope

- **No live FX rates.** Currency conversion is static/admin-managed by design (see
  above), not a real-time feed.
- **No non-USD checkout.** Creem settles in USD only, regardless of display currency.
- **No report export (PDF, etc.).** `canExportLocalizedReports` is hardcoded `false`
  for every plan — the feature doesn't exist anywhere in the app yet.
- **RTL is wired but not visually audited.** `direction` is stored per language and
  flows into `<html dir>`, but no RTL language has real translated content yet (all
  active/near-active languages — English, Spanish — are LTR), so RTL layout has not
  been checked in a real browser against actual right-to-left text.
- **Admin/internal tooling stays English-only.** Admin screens (`/admin/**`) are not
  translated and are not planned to be — the audience is internal.
- **Only English and Spanish have real message catalogs.** Every other registered
  locale (52 of 54) is Tier 4: seeded, disabled, ready to activate, but not
  translated. `getAppShellMessages()` and next-intl's request config both fall back to
  English for any locale without a catalog.
