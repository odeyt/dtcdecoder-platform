# Region Profile System — Adding a New Country

The architecture is designed so that adding Vietnam, Cambodia, Malaysia, Singapore, Indonesia, the Philippines, Japan, Korea, Australia, or any EU country requires **one new profile object and one registry entry** — no other file changes, no switch statements to update.

## Steps

1. **Add a profile object** to `src/lib/region/region-profile.ts`:

   ```ts
   export const VIETNAM: RegionProfile = {
     id: "VN",
     name: "Vietnam",
     countryCode: "VN",
     defaultLanguage: "vi",           // must already be a supported locale —
                                       // see step 2 if it isn't yet
     supportedLanguages: ["vi", "en"],
     currency: "VND",
     timezone: "Asia/Ho_Chi_Minh",
     measurementSystem: "metric",
     dateFormat: "DD/MM/YYYY",
     numberFormat: "vi-VN",
     preferredSuppliers: { country: "Vietnam" },
     defaultMarketplace: "Vietnam",
   };
   ```

2. **Register it** in `src/lib/region/region-registry.ts`:

   ```ts
   export const REGION_PROFILES: Record<string, RegionProfile> = {
     LA: LAOS,
     TH: THAILAND,
     VN: VIETNAM,   // <- one line
     GLOBAL: GLOBAL,
   };
   ```

That's it for the region layer itself. Everything downstream — `resolveRegion()`'s priority chain, `RegionProvider`/`useRegion()`, `formatRegionCurrency`/`Date`/`Number`, the settings-page selector, the geo-detection banner — reads from `REGION_PROFILES`/`listRegionProfiles()` and needs no changes.

## Language prerequisite

`defaultLanguage` must be a locale this app actually serves. Check `src/lib/i18n/locale-codes.ts`:

- If it's already in `LIVE_LOCALES`, the UI chrome is already translated — nothing more to do for the region layer.
- If it's in the broader `LOCALE_CODES` superset but not yet `LIVE_LOCALES` (registered but not translated), the region profile can still be added — `useRegion().language` will report the code correctly — but the app's interface won't actually render in that language until a real translation pass adds it to `LIVE_LOCALES` and a message catalog exists. Don't set `defaultLanguage` to a code that isn't in `LOCALE_CODES` at all; `isRecognizedLocaleCode`-style checks elsewhere in the app will reject it.
- Vietnamese (`vi`), Khmer (`km`), Chinese Simplified (`zh-CN`), German (`de`), Japanese (`ja`), Korean (`ko`), Portuguese-Brazil (`pt-BR`), and French (`fr`) are **already live locales** as of this writing — a region profile for Vietnam, Cambodia, mainland China, Germany, Japan, Korea, Brazil, or France needs no new translation work at all, only the two steps above.

## Currency prerequisite

`currency` should be a real ISO 4217 code. `Intl.NumberFormat`/`formatRegionCurrency` will format it correctly regardless of whether it's `enabled` in the admin `currencies` table — that table gates a *separate* system (the converted checkout-price display), not this one. If you also want the account preferences page's currency dropdown to actually offer that currency (and the converted-price display elsewhere to use it), enable it in `/admin/currencies` and add a real display rate — see `REGION_PROFILE_SETUP.md`.

## Timezone

Use the IANA zone name (`Asia/Ho_Chi_Minh`, not `GMT+7`). `Intl.DateTimeFormat` owns the real offset/DST rules for it — nothing to configure beyond the correct zone name.

## Testing a new profile

- Add it to the parametrized cases in `test/region-registry.test.ts` / `test/region-resolver.test.ts` if you want dedicated coverage (existing tests iterate `listRegionProfiles()` for the format-agnostic checks, so a new profile is covered by those automatically; add explicit cases for anything region-specific, like the resolver's browser-locale-matching test does for Thai/Lao).
- Add a Playwright case mirroring the existing Laos/Thailand/Global selector tests in `tests/e2e/region/region-profile.spec.ts` if the new region's currency is expected to be enabled (so the honest-fallback behavior doesn't apply) — otherwise the existing generic assertions (language/timezone/date-format pre-fill) apply unchanged.

## What you should never need to do

- Add a `switch (regionId)` or `if (regionId === "TH")` anywhere in application code — if you find yourself doing this, the registry/resolver abstraction isn't being used correctly; route the new behavior through `getRegionProfile()`/`useRegion()` instead.
- Touch `resolveRegion()`'s priority-chain logic itself.
- Touch `RegionProvider`, `useRegion()`, or the formatters in `region-format.ts`.
- Add a new database column or migration purely to support a new country — a `RegionProfile` is a static, code-committed bundle of defaults for existing preference columns, not a new row-per-country data source.
