# Region Profile System — Architecture

One platform, one Supabase database, one AI Diagnostic Engine, one auth system, one payment platform, one deployment. A Region Profile is a bundle of **display/formatting defaults** for a country — it never changes diagnostic behavior.

## What changes by region vs. what never does

**Changes by region:** language, currency (display formatting only), timezone, date format, number format, measurement system, supplier/marketplace directory (placeholder today).

**Never changes by region:** DTC definitions, VIN decoding, AI reasoning, safety rules, HV rules, the Evidence/Question/Confidence Engines, Repair Verification, Test Planner. Nothing in this feature touches any of those.

## Relationship to the existing i18n system

This system **does not replace or duplicate** the localization infrastructure already in this codebase (`src/lib/i18n/*`, the `languages`/`currencies`/`user_preferences` tables, next-intl). It's a thin layer on top:

- **A `RegionProfile` is a preset of already-existing preference values.** Selecting "Thailand" sets `interface_locale`, `preferred_currency`, `timezone`, `measurement_system`, and `date_format` to sensible defaults — the same columns the account preferences form already saved before this feature existed. No new preference columns were added.
- **`region_code`** (added in migration `0009`, previously free text with no validation) is now validated against the region registry when a value is submitted, but the column itself already existed.
- **`timezone`** (added in migration `0009`, previously present in the schema and type but never exposed in the preferences form or Server Action) is now wired into both.
- Real translation content (next-intl message catalogs, AI diagnostic-text translation) is completely unchanged — Thai and Lao were already live UI locales before this feature; nothing here re-implements that.

## Files

```
src/lib/region/
  region-types.ts              RegionProfile, RegionSource, ResolvedRegion
  region-profile.ts            Static profiles: LAOS, THAILAND, GLOBAL
  region-registry.ts           REGION_PROFILES map + lookup helpers — the
                                only place with a per-country list; nothing
                                else in the app branches on region id.
  region-resolver.ts           resolveRegion() — pure function, the priority
                                chain (see below)
  region-constants.ts          Client-safe constants (cookie name) — see
                                "Server/client split" below
  region-server.ts             resolveRegionServer() — the real cookie/
                                header/DB reads, server-only
  region-context.tsx           RegionProvider (React context)
  region-hooks.ts               useRegion()
  region-format.ts             formatRegionCurrency/Number/Date/DateTime —
                                Intl-only formatting
  region-marketplace.ts        Static supplier/marketplace reference data
                                (interfaces + data only, no integration)
  region-marketplace-context.tsx  MarketplaceProvider / useMarketplace()

src/components/
  RegionGeoBanner.tsx           First-visit "looks like you're in X" banner
```

## RegionProfile shape

```ts
export interface RegionProfile {
  id: string;
  name: string;
  countryCode: string;
  defaultLanguage: string;       // must be a locale this app actually serves
  supportedLanguages: string[];
  currency: string;              // ISO 4217
  timezone: string;               // IANA zone name
  measurementSystem: "metric" | "imperial";
  dateFormat: string;              // human-readable label, e.g. "DD/MM/YYYY"
  numberFormat: string;            // BCP-47 tag passed to Intl
  preferredSuppliers: { country: string };
  defaultMarketplace: string;
}
```

`REGION_PROFILES` (in `region-registry.ts`) is the single registry. Adding a country never requires a switch statement anywhere else in the app — see `REGION_PROFILE_EXPANSION.md`.

## Resolution priority chain

`resolveRegion()` in `region-resolver.ts` is a pure function (no I/O), implementing:

1. **User preference** — `user_preferences.region_code`, for a signed-in account with a saved value.
2. **Profile setting** — the `dtc_region_preference` cookie (set by the geo-detection banner or before a signed-in save completes).
3. **Browser locale** — the visitor's own language, matched **only** against a profile's `defaultLanguage` (never a secondary supported language — Laos and Thailand both list `en` as secondary, which would otherwise be ambiguous). GLOBAL is explicitly excluded from this tier even though its own `defaultLanguage` is `en` — see the regression test/comment in `region-resolver.ts` for why an English browser locale must resolve via tier 5, not a false "specific match" at tier 3.
4. **Country** — Vercel's `x-vercel-ip-country` request header, set for free on every plan, no geo-IP service or new dependency required. Absent outside Vercel (e.g. local `next dev`), in which case this tier is simply skipped.
5. **GLOBAL** — final fallback, always resolves to something.

The real cookie/header/DB reads live in `resolveRegionServer()` (`region-server.ts`), kept separate from the pure resolver specifically so the resolver is trivially unit-testable.

## Server/client split (a real bug caught during development)

`region-server.ts` starts with `import "server-only"` and reads `next/headers` + Supabase. Early in development, `RegionGeoBanner.tsx` (a client component) imported a constant from that file just to get the cookie name — which pulled the entire server-only module (including Supabase admin code) into the client bundle and broke the dev build. The fix: the cookie name lives in `region-constants.ts` (no server imports), and `region-server.ts` re-exports it for server-side callers. This mirrors an identical split this codebase already used for `APP_LOCALE_COOKIE_NAME` (`app-shell-locale-constants.ts` vs. `app-shell-locale.ts`).

## Why RegionProvider isn't mounted globally

`resolveAppShellLocale()` (the existing interface-locale resolver) has an explicit rule: never call it from `(app)/layout.tsx` itself, because reading `cookies()`/auth there would force every currently-static `(app)` page (login, privacy, terms, ...) into per-request dynamic rendering. `resolveRegionServer()` has the identical cost and the identical rule — it's only called from pages that are already dynamic (e.g. the preferences page).

`RegionGeoBanner` sidesteps this entirely: it's a **client** component that does its own client-side region resolution from `navigator.language` (via the same pure `resolveRegion()` used server-side), with no server data dependency at all. Including it in `(app)/layout.tsx` is safe because a client component with no server read doesn't affect the page's rendering mode — only server-side `cookies()`/`headers()`/auth reads do.

## Currency/timezone/date formatting

`region-format.ts` is deliberately separate from `src/lib/currency.ts` / `src/lib/format.ts`, which serve one specific existing job: displaying a **converted** price next to a fixed USD checkout amount, driven by the admin-managed `currencies`/`currency_rates` tables. `region-format.ts` does a different job — formatting an already-known amount/date/number the way a visitor from a region expects to read it — and never converts anything or touches what a customer is actually charged.

- `formatRegionCurrency`/`formatRegionNumber` use `Intl.NumberFormat(region.numberFormat, ...)`. Never a hardcoded symbol table.
- `formatRegionDate`/`formatRegionDateTime` use `Intl.DateTimeFormat(region.numberFormat, { timeZone: region.timezone, calendar: "gregory", ... })`. `calendar: "gregory"` is explicit — `th-TH`'s locale default is the Buddhist Era calendar (year = Gregorian + 543), and every other date in this app is Gregorian; silently switching calendars for Thai/Lao users would be a surprising inconsistency, not a feature.
- `region.dateFormat` (e.g. `"DD/MM/YYYY"`) is a human-readable label only — actual rendering always goes through `Intl.DateTimeFormat`, never manual pattern substitution.
- Never a manually maintained UTC-offset table — `Intl` owns real-world DST/offset rules for every IANA zone.

## Marketplace / supplier — architecture only

`region-marketplace.ts` and `region-marketplace-context.tsx` are **interfaces and static reference data only** — no supplier API integration exists or is called. `MARKETPLACE_PROFILES` holds the placeholder supplier-source lists from the spec (Laos: Partsouq / Local Dealers / Importers; Thailand: Dealer Network / Aftermarket / Local Distributors; Global: none yet). `MarketplaceProvider` derives its value from whatever `RegionProvider` currently holds — no fetch, no loading state, no live data.

## AI-prompt region injection

The spec's "inject region into AI prompts, wording only, never diagnostic reasoning" requirement is intentionally satisfied by **reuse, not new code**. This app's diagnosis pipeline already has exactly this shape: `runDiagnosis()` generates the canonical answer in English once; a separate, explicit `translateDiagnosticText()` call (`src/lib/ai/assistant.ts`) translates that fixed text into the user's `ai_report_locale`, given the language name/locale code and a terminology glossary — never regenerating the diagnosis itself. That's precisely "wording only, never reasoning."

Selecting a region can set a sensible **default** `ai_report_locale` (through the same `interfaceLocale`-style default-filling the settings page already does for other fields) — but the translation mechanism itself needed no new code. No region-aware prompt was added to the *main* diagnosis system prompt, deliberately: the spec's own "Diagnostic reasoning... must NEVER change by Region" rule means the reasoning-generating call must stay region-blind.

## Honest fallback: currency defaults

Thailand's `currency` is `THB` and Laos's is `LAK`, but neither is currently `enabled` in the admin `currencies` table (confirmed by direct query during development — the rows exist, disabled, with no `currency_rates` entry either). `AccountPreferencesForm`'s region-default-filling logic checks this: it only pre-fills the currency field when the target currency is actually enabled, otherwise leaves the current value untouched rather than silently saving a value the server would reject. Enabling `THB`/`LAK` (and entering a real, non-fabricated display FX rate) is an admin content decision, not something this code does automatically — see "Follow-up" below.

## Testing

- **Unit** (`test/region-registry.test.ts`, `test/region-resolver.test.ts`, `test/region-format.test.ts`) — registry lookups, the full priority chain (including the GLOBAL/browser-locale edge case above), Intl-based formatting, Gregorian-calendar override, real timezone-offset agreement between Bangkok and Vientiane.
- **Playwright** (`tests/e2e/region/region-profile.spec.ts`) — region selection pre-filling defaults (including the honest-currency-fallback case), persistence across reload, geo-detection banner appearing once and respecting a choice, all against a throwaway synthetic account (comped to Pro, since the preferences page is plan-gated) — never production data.

Two real bugs were caught and fixed by this test suite during development (see `REGION_PROFILE_SETUP.md`'s changelog): a WCAG 2.5.3 violation (an `aria-label` silently overriding a button's already-clear visible text) and a resolver bug (an English browser locale falsely reporting a "specific region match" against GLOBAL). Both are covered by regression tests now.

## Out of scope this pass

- Live currency conversion / non-USD Creem checkout (matches this app's existing i18n plan's explicit scoping).
- PDF/email report localization — no PDF or email report *export* feature exists anywhere in this app yet; the spec's "PDF reports must match user language" bullet has nothing to attach to today.
- Real supplier/marketplace integrations — architecture only, per the spec's own instruction.
- IP-geolocation beyond Vercel's free header — no paid geo-IP service was added.
