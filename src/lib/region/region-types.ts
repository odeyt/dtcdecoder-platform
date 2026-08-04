// Region Profile System — see docs/REGION_PROFILE_ARCHITECTURE.md.
//
// A RegionProfile is a bundle of sensible DEFAULTS for a country: which
// language/currency/timezone/measurement-system/date-format a new user from
// that country probably wants. It is NOT a second source of truth for any
// of those individual preferences — the user's actual saved choice for each
// one still lives on the existing `user_preferences` row (`interface_locale`,
// `preferred_currency`, `timezone`, `measurement_system`, `date_format`,
// `region_code`), and the user can override any single field independently
// of the region they picked. Selecting "Thailand" pre-fills those fields;
// it does not lock them together afterward.
export interface RegionProfile {
  /** Stable identifier — matches `user_preferences.region_code` when saved. */
  id: string;
  name: string;
  countryCode: string;
  /** Must be a locale this app actually serves — see locale-codes.ts. */
  defaultLanguage: string;
  supportedLanguages: string[];
  /** ISO 4217. Formatting works via Intl regardless of whether this
   *  currency is enabled in the admin `currencies` table — that table
   *  gates a SEPARATE system (converted checkout-price display) this
   *  module does not touch. */
  currency: string;
  /** IANA timezone name, e.g. "Asia/Bangkok". */
  timezone: string;
  measurementSystem: "metric" | "imperial";
  /** Human-readable pattern shown in the UI, e.g. "DD/MM/YYYY". */
  dateFormat: string;
  /** A BCP-47 tag passed to Intl.NumberFormat/Intl.DateTimeFormat. */
  numberFormat: string;
  preferredSuppliers: {
    country: string;
  };
  defaultMarketplace: string;
}

export type RegionId = string;

// Where a resolved region actually came from — surfaced for debugging/tests,
// not shown to the user. Mirrors the priority chain in region-resolver.ts.
export type RegionSource = "user_preference" | "profile_setting" | "browser_locale" | "country" | "global_fallback";

export interface ResolvedRegion {
  profile: RegionProfile;
  source: RegionSource;
}
