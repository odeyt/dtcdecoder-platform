// Region resolution — priority chain per docs/REGION_PROFILE_ARCHITECTURE.md:
//   1. User preference   (user_preferences.region_code, signed-in + saved)
//   2. Profile setting    (a not-yet-saved choice, e.g. the anonymous
//                          dtc_region_preference cookie set by the
//                          geo-detection banner or the settings selector
//                          before it's persisted to a signed-in account)
//   3. Browser locale     (the visitor's own language, matched against a
//                          profile's defaultLanguage — never its secondary
//                          languages, since e.g. "en" is secondary for both
//                          Laos and Thailand and would be ambiguous)
//   4. Country            (an IP-derived country hint — Vercel's edge
//                          network sets `x-vercel-ip-country` for free on
//                          every plan, so this tier needs no paid geo-IP
//                          service or new dependency)
//   5. GLOBAL              (final fallback — always resolves to something)
//
// This function is pure (no I/O) so it's trivially unit-testable; the
// actual cookie/header/DB reads live in region-server.ts's
// resolveRegionServer(), which gathers these four inputs and calls this
// once per request.
import { GLOBAL } from "./region-profile";
import { getRegionProfile, isRecognizedRegionId, listRegionProfiles, findRegionByCountryCode } from "./region-registry";
import type { ResolvedRegion } from "./region-types";

export interface RegionResolutionInput {
  userPreferenceRegionId?: string | null;
  profileSettingRegionId?: string | null;
  browserLocale?: string | null;
  countryCodeHint?: string | null;
}

function primaryLanguageSubtag(locale: string): string {
  return locale.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

function matchByBrowserLocale(browserLocale: string): ResolvedRegion | null {
  const subtag = primaryLanguageSubtag(browserLocale);
  if (!subtag) return null;
  // GLOBAL is deliberately excluded: its defaultLanguage is "en", so any
  // English browser locale would otherwise "match" it here and be reported
  // as source "browser_locale" — a false specific-match signal indistinguishable
  // from a real country match. GLOBAL is the fallback, not a country
  // reachable through this tier; "en" always falls through to
  // global_fallback below, same end profile, honest source.
  const match = listRegionProfiles().find((p) => p.id !== "GLOBAL" && p.defaultLanguage === subtag);
  return match ? { profile: match, source: "browser_locale" } : null;
}

export function resolveRegion(input: RegionResolutionInput): ResolvedRegion {
  if (isRecognizedRegionId(input.userPreferenceRegionId)) {
    return { profile: getRegionProfile(input.userPreferenceRegionId), source: "user_preference" };
  }

  if (isRecognizedRegionId(input.profileSettingRegionId)) {
    return { profile: getRegionProfile(input.profileSettingRegionId), source: "profile_setting" };
  }

  if (input.browserLocale) {
    const byLocale = matchByBrowserLocale(input.browserLocale);
    if (byLocale) return byLocale;
  }

  const byCountry = findRegionByCountryCode(input.countryCodeHint);
  if (byCountry) return { profile: byCountry, source: "country" };

  return { profile: GLOBAL, source: "global_fallback" };
}
