# Region Profile System — Setup

## Prerequisite: migration `0009`

The Region Profile System reuses `user_preferences.region_code` and `.timezone`, both added by `supabase/migrations/0009_preferences_region_fields.sql`. That migration was already committed to this repo (part of the original i18n rollout) but was found, during this feature's development, to have **never actually been applied** to the production database — confirmed directly via `information_schema.columns` and PostgREST's own schema introspection, independent of any local caching.

If you're setting this up against a fresh or out-of-sync database, confirm those columns exist before anything else:

```sql
select column_name from information_schema.columns where table_name = 'user_preferences' order by column_name;
```

Expect to see `region_code`, `temperature_unit`, `time_format`, `timezone`, `measurement_system`, `date_format`, `interface_locale`, `preferred_currency` among the results. If `region_code`/`temperature_unit`/`time_format` are missing, run migration `0009` (paste into the Supabase SQL editor — same manual-apply workflow as every other migration in this repo). No new migration was written for the Region Profile feature itself.

## No new environment variables

Nothing in `src/lib/region/` reads a new env var. The "Country" resolution tier reads Vercel's `x-vercel-ip-country` request header, which Vercel sets automatically on every plan — no API key, no third-party geo-IP service, nothing to configure. Locally (`next dev`, not behind Vercel's edge network), that header is simply absent and that tier is skipped — resolution still works via the other four tiers.

## Enabling a region's language/currency for real users

Selecting "Thailand" as a region sets `interface_locale` to `th` — this already works today, because `th` (and `lo`) were made live UI locales by an earlier phase of this app's i18n rollout (`LIVE_LOCALES` in `src/lib/i18n/locale-codes.ts`). Nothing to do there.

Thailand's currency default is `THB` and Laos's is `LAK`. As of this writing, **both are present as rows in the `currencies` table but `enabled = false`**, and neither has a `currency_rates` entry. This feature does not flip those flags automatically — that's a deliberate choice (see `REGION_PROFILE_ARCHITECTURE.md`'s "Honest fallback" section): enabling a currency and entering its display exchange rate is a real content/business decision (an actual rate has to come from somewhere and be kept current), not something safe to default on silently. If/when an admin wants Thai/Lao visitors to see a converted display price:

1. Enable the currency row in the `currencies` admin screen (`/admin/currencies`).
2. Enter a real static display rate in `currency_rates` (the existing admin-managed rate system this app already uses — see `LOCALIZATION_ARCHITECTURE.md`).

Until then, selecting Thailand/Laos as a region still sets language/timezone/date-format defaults correctly; the currency field is simply left at its current value rather than defaulting to a currency that isn't live yet.

AI-output translation for Thai/Lao (`ai_output_enabled` on the `languages` table) is similarly **not** touched by this feature — as of this writing it's `false` for both, meaning diagnosis text still generates/translates in English for those locales even after selecting the Thailand/Laos region. Turning that on is a translation-quality decision for whoever owns that rollout, matching this app's own established "don't claim quality that hasn't been verified" pattern for other Tier-2+ locales.

## Local development

No setup beyond the migration check above. `npm run dev` and visit `/account/preferences` (Pro/Workshop plan required to save — Free accounts see the form disabled with an upgrade prompt, matching every other preference field). The geo-detection banner activates automatically for any signed-in `(app)` page visit whose browser locale matches a region's default language and hasn't been dismissed yet (tracked via `localStorage`, key `dtc_region_geo_banner_decided`).

## Changelog (bugs found and fixed during this feature's own development)

Kept here because they're the kind of mistake worth not repeating:

1. **Client/server import boundary** — a client component (`RegionGeoBanner.tsx`) imported a constant from a `"server-only"` module, breaking the dev build. Fixed by splitting the constant into `region-constants.ts`. See `REGION_PROFILE_ARCHITECTURE.md`.
2. **WCAG 2.5.3 (Label in Name) violation** — the banner's dismiss button had both visible text ("No thanks") and a redundant `aria-label` ("Dismiss region suggestion"); the `aria-label` silently won as the accessible name, which a Playwright role-based locator (and any screen reader) would see instead of the visible text. Fixed by removing the redundant `aria-label`.
3. **False "specific match" for GLOBAL** — an English browser locale legitimately matched GLOBAL's own `defaultLanguage: "en"` at the browser-locale resolution tier, which the geo-banner then misread as "a real country was matched, worth suggesting" — offering to "switch to Global." Fixed by excluding GLOBAL from that tier's candidate list; an English locale now correctly falls through to the `global_fallback` tier instead, landing on the same profile but with an honest `source`.
4. **Shared-fixture test races** — the Playwright spec's two describe blocks each share one synthetic account across multiple tests that actually mutate its `user_preferences` row (or sign in with its credentials) concurrently; `fullyParallel` (the local default) raced them. Fixed with `test.describe.configure({ mode: "serial" })` on both blocks — a fixture-sharing issue, not a product bug.
5. **Locale-dependent Playwright assertions in shared auth helpers** — `signInWithPassword`'s success check originally waited for the literal English heading text "My Account," which broke the moment a test's own account language preference was saved as Thai (working as intended — selecting a region does change account language). Fixed to wait on `url.pathname === "/account"` instead. A second, related bug: the URL check's regex initially matched `/account/login` too (since it contains "/account/"), causing `waitForURL` to resolve before sign-in had even happened; fixed by comparing the parsed pathname exactly rather than a substring-matching regex.
6. **A real, pre-existing, unrelated production bug**, found only because this feature's Playwright suite exercises the "Save preferences" flow for the first time in this codebase's test history: migration `0009` had never been applied to production, so saving `temperature_unit`/`time_format` (fields the existing preferences form has submitted on every save since before this feature existed) has been silently failing for every real user. Confirmed and fixed during this feature's development — see the top of this document.
